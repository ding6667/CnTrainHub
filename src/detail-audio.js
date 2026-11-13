/**
 * 运行环境音：风噪 + 钢轨节律 + 低频轰鸣，全部由 WebAudio 合成，无音频资产。
 * 音量与音高都绑在车速上，停车即静音；首次用户手势后才创建 AudioContext。
 */
export function createAudio() {
  let ctx = null;
  let master = null;
  let windGain = null;
  let rumbleGain = null;
  let windFilter = null;
  let rumble = null;
  let started = false;
  let muted = false;
  let clackAt = 0;
  let travelAtClack = 0;

  const supported = typeof window !== 'undefined' && Boolean(window.AudioContext || window.webkitAudioContext);

  function noiseBuffer(context) {
    const len = context.sampleRate * 2;
    const buf = context.createBuffer(1, len, context.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    return buf;
  }

  function start() {
    if (started || !supported) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);

    const buf = noiseBuffer(ctx);

    const wind = ctx.createBufferSource();
    wind.buffer = buf;
    wind.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 620;
    windFilter.Q.value = 0.7;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    wind.connect(windFilter).connect(windGain).connect(master);
    wind.start();

    const rumbleSrc = ctx.createBufferSource();
    rumbleSrc.buffer = buf;
    rumbleSrc.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 150;
    rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0;
    rumbleSrc.connect(lp).connect(rumbleGain).connect(master);
    rumbleSrc.start();

    rumble = ctx.createOscillator();
    rumble.type = 'sine';
    rumble.frequency.value = 46;
    const rg = ctx.createGain();
    rg.gain.value = 0.0;
    rumble.connect(rg).connect(master);
    rumble.start();
    rumble._gain = rg;

    started = true;
  }

  function clack(strength) {
    if (!started || muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    const len = Math.floor(ctx.sampleRate * 0.07);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.5);
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 240 + Math.random() * 160;
    bp.Q.value = 1.6;
    const g = ctx.createGain();
    g.gain.value = 0.16 * strength;
    src.connect(bp).connect(g).connect(master);
    src.start(t);
    src.stop(t + 0.09);
  }

  return {
    supported,
    get muted() {
      return muted;
    },
    resume() {
      start();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    toggle() {
      muted = !muted;
      if (!muted) this.resume();
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.08);
      return muted;
    },
    update(velocity, maxSpeed, travel) {
      if (!started || !ctx) return;
      const k = Math.min(1, velocity / maxSpeed);
      const t = ctx.currentTime;
      windGain.gain.setTargetAtTime(0.055 * k + 0.012 * Math.sqrt(k), t, 0.15);
      windFilter.frequency.setTargetAtTime(480 + 1500 * k, t, 0.2);
      rumbleGain.gain.setTargetAtTime(0.1 * k, t, 0.2);
      rumble.frequency.setTargetAtTime(38 + 34 * k, t, 0.25);
      rumble._gain.gain.setTargetAtTime(0.05 * k, t, 0.25);
      // 每 12.4 m 一组钢轨接头，与枕木滚动同源
      if (velocity > 0.6 && travel - travelAtClack > 12.4) {
        travelAtClack = travel;
        clackAt += 1;
        clack(0.35 + 0.65 * k);
        setTimeout(() => clack(0.28 + 0.5 * k), 105);
      }
      if (velocity <= 0.6) travelAtClack = travel;
    },
    dispose() {
      if (ctx) ctx.close();
      ctx = null;
      started = false;
    },
  };
}