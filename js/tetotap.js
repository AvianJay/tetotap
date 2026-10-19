/**
 * Tetotap — a Kasane Teto fan sound playground.
 * The PIXI/GSAP animation collection is adapted from Mikutap by daniwell.
 * Original: https://aidn.jp/mikutap/ · Port: HFIProgramming/mikutap
 * Teto voice: rendered UTAU performances, voice library by 小山乃舞世.
 */
"use strict";

class TetoAudio {
  constructor() {
    this.context = null;
    this.buffers = { main: [], track: [] };
    this.sources = new Set();
  }
  async unlock() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.context = new AudioContext();
      this.output = this.context.createGain();
      this.output.gain.value = 0.72;
      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -12;
      compressor.ratio.value = 6;
      this.output.connect(compressor);
      compressor.connect(this.context.destination);
    }
    if (this.context.state !== "running" && this.context.state !== "closed") {
      await this.context.resume();
    }
  }
  async load(progress) {
    let loaded = 0;
    await Promise.all(
      ["main", "track"].map(async (group) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        let clips;
        try {
          const response = await fetch(`data/${group}/${group}.json`, {
            signal: controller.signal,
          });
          if (!response.ok) throw new Error("Sound request failed");
          clips = await response.json();
        } finally {
          clearTimeout(timeout);
        }
        const length = group === "main" ? 32 : 11;
        await Promise.all(
          Array.from({ length }, async (_, id) => {
            const encoded = clips[`${id}.mp3`];
            if (typeof encoded !== "string") throw new Error("Missing sound");
            const raw = atob(encoded.split(",")[1]);
            const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
            this.buffers[group][id] = await this.context.decodeAudioData(
              bytes.buffer,
            );
            progress(++loaded / 43);
          }),
        );
      }),
    );
  }
  play(group, id, when = this.context.currentTime, volume = 1) {
    const buffer = this.buffers[group][id];
    if (!buffer || this.context.state !== "running") return;
    if (this.sources.size >= 48)
      this.stopSource(this.sources.values().next().value);
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(this.output);
    const entry = { source, gain, group };
    this.sources.add(entry);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      this.sources.delete(entry);
    };
    source.start(Math.max(when, this.context.currentTime));
  }
  stopSource(entry) {
    if (!entry) return;
    try {
      entry.source.stop();
    } catch (_) {
      /* Already finished. */
    }
    entry.source.disconnect();
    entry.gain.disconnect();
    this.sources.delete(entry);
  }
  stop(group) {
    for (const entry of this.sources) {
      if (!group || entry.group === group) this.stopSource(entry);
    }
  }
}

class TetoBeat {
  constructor(audio) {
    this.audio = audio;
    this.timer = null;
  }
  start() {
    this.stop();
    this.step = 0;
    this.next = this.audio.context.currentTime + 0.04;
    const pattern =
      "3443443443443434566566566566565678878878878878789119119119119191";
    const schedule = () => {
      const now = this.audio.context.currentTime;
      if (this.next < now - 0.2) this.next = now + 0.02;
      while (this.next < now + 0.12) {
        const drum = [0, 1, 2, 1][this.step % 4];
        let harmony = Number(pattern[this.step % pattern.length]);
        if (harmony === 1) harmony = 10;
        this.audio.play("track", drum, this.next, drum === 1 ? 0.65 : 1);
        this.audio.play("track", harmony, this.next, 0.8);
        this.next += 60 / 140 / 2;
        this.step++;
      }
    };
    schedule();
    this.timer = setInterval(schedule, 25);
  }
  stop() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.audio.stop("track");
  }
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

function initTetotap() {
  const $ = (selector) => document.querySelector(selector);
  const view = $("#view");
  const about = $("#about");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const audio = new TetoAudio();
  const beat = new TetoBeat(audio);
  const R = { play: (id) => audio.play("main", id) };
  let G = innerWidth,
    A = innerHeight;
  let playing = false,
    loading = false,
    ready = false,
    taps = 0;
  let U = preference("feedback"),
    backtrack = preference("backtrack");
  PIXI.utils._saidHello = true;
  const renderer = PIXI.autoDetectRenderer(G, A, {
    backgroundColor: 0xc92b48,
    antialias: true,
    resolution: Math.min(devicePixelRatio || 1, 2),
  });
  view.appendChild(renderer.view);
  const z = new PIXI.Container();

  function preference(key) {
    try {
      return localStorage.getItem(`tetotap.${key}`) !== "off";
    } catch (_) {
      return true;
    }
  }
  function save(key, value) {
    try {
      localStorage.setItem(`tetotap.${key}`, value ? "on" : "off");
    } catch (_) {
      /* Playback still works without storage. */
    }
  }
  function showToggle(id, active) {
    $(id).setAttribute("aria-pressed", String(active));
    $(`${id} .toggle-state`).textContent = active ? "開" : "關";
  }
  function onTap(id) {
    $("#tap_count").textContent = String(++taps).padStart(3, "0");
    $("#sound_label").textContent = [
      "TE · TO !",
      "LA · LA !",
      "KA · SA · NE !",
      "TE · TO · TE · TO !",
    ][Math.floor(id / 8)];
    const character = $("#teto_reaction");
    character.classList.remove("is-tapping");
    void character.offsetWidth;
    character.classList.add("is-tapping");
  }

  /* Original Mikutap animation collection, with Teto's palette and pointer input. */
  const g = new (function () {
    var s = function (n, a) {
        ((this.id = n),
          (this.setPosition = function (n, a) {
            ((r.position.x = e = n), (r.position.y = t = a));
          }),
          (this.setSize = function (n, a) {
            ((i = n),
              (o = a),
              r.clear(),
              r.beginFill(16777215),
              (r.alpha = 0),
              r.drawRect(0, 0, i, o));
          }),
          (this.play = function () {
            U &&
              !reducedMotion.matches &&
              gsap.fromTo(
                r,
                0.5,
                { alpha: 0.18 },
                { alpha: 0, ease: Power0.easeNone },
              );
          }),
          (this.hitcheck = function (n, a) {
            return e <= n && n < e + i && t <= a && a < t + o;
          }));
        var e = 0,
          t = 0,
          i = 0,
          o = 0,
          r = new PIXI.Graphics();
        ((r.interactive = !0), a.addChild(r));
      },
      n = function (n) {
        function a() {
          (o.clear(), o.beginFill(16777215), o.drawRect(0, 0, G, A));
        }
        function e() {
          t.resize();
        }
        ((this.resize = function () {
          (o.clear(), o.beginFill(i), o.drawRect(0, 0, G, A));
        }),
          (this.flash = function () {
            r.setChildIndex(o, r.children.length - 1);
            for (var n = 0; n < 3; n += 2)
              (gsap.delayedCall(0.07 * n, a),
                gsap.delayedCall(0.07 * (n + 1), e));
          }),
          (this.setColor = function (n, a) {
            ((i = n), (a = 0 <= a ? a : 0), r.setChildIndex(o, a), t.resize());
          }));
        var t = this,
          i = 16777215,
          o = new PIXI.Graphics(),
          r = n;
        r.addChild(o);
      },
      d = function (n, a) {
        function e() {
          var n,
            a,
            e,
            t = 1.3 * d;
          if ((f.clear(), f.beginFill(0), f.moveTo(0, 0), 0 == o))
            for (var i = 0; i < c.rotation; i += 30)
              ((n = ((s * i + l) * Math.PI) / 180),
                (a = Math.cos(n) * t),
                (e = Math.sin(n) * t),
                f.lineTo(a, e));
          else
            for (i = 360; c.rotation < i; i -= 30)
              ((n = ((s * i + l) * Math.PI) / 180),
                (a = Math.cos(n) * t),
                (e = Math.sin(n) * t),
                f.lineTo(a, e));
          ((n = ((s * c.rotation + l) * Math.PI) / 180),
            (a = Math.cos(n) * t),
            (e = Math.sin(n) * t),
            f.lineTo(a, e),
            f.lineTo(0, 0),
            f.endFill());
        }
        function t() {
          ((o = 1),
            gsap.fromTo(
              c,
              0.9,
              { rotation: 0 },
              {
                rotation: 360,
                ease: Power1.easeOut,
                onUpdate: e,
                onComplete: i,
              },
            ));
        }
        function i() {
          r && r();
        }
        this.play = function (n, a) {
          ((o = 0),
            (d = n),
            (r = a),
            (l = 360 * Math.random()),
            (s = 1),
            Math.random() < 0.5 && (s = -1),
            f.clear(),
            f.beginFill(0),
            f.moveTo(0, 0),
            f.lineTo(1, 1),
            f.endFill(),
            gsap.fromTo(
              c,
              0.6,
              { rotation: 0 },
              {
                rotation: 360,
                ease: Power1.easeOut,
                onUpdate: e,
                onComplete: t,
              },
            ));
        };
        var o,
          r,
          l,
          s,
          d,
          h = n,
          c = { rotation: 0 },
          f = new PIXI.Graphics();
        (h.addChild(f), (a.mask = f));
      },
      r = function (n) {
        function h() {
          (w.clear(), 0 == f ? w.lineStyle(v, u) : w.beginFill(u));
          for (var n = 0; n < p; n++) {
            var a = M["p" + n].x,
              e = M["p" + n].y;
            0 == n ? w.moveTo(a, e) : w.lineTo(a, e);
          }
          ((a = M.p0.x), (e = M.p0.y), w.lineTo(a, e));
        }
        function c() {
          ((w.visible = !1), e && e());
        }
        this.play = function (n, a) {
          ((f = n),
            (e = a),
            (function () {
              (y.setChildIndex(w, y.children.length - 1),
                (w.visible = !0),
                (w.x = G / 2),
                (w.y = A / 2),
                (u = L()));
              var n,
                a = Math.min(G, A) * (0.32 * Math.random() + 0.16),
                e = Math.floor(5 * Math.random()) + 3;
              ((p = e),
                (v = 5 * Math.random() + 3),
                w.clear(),
                (w.rotation = 30 * Math.floor(6 * Math.random())),
                (M = {}),
                (n = 0 == f ? 3 : 2.5));
              for (var t = 360 / p, i = 0; i < p; i++) {
                var o = (i * t * Math.PI) / 180,
                  r = a * Math.cos(o),
                  l = a * Math.sin(o),
                  s = r + a * (Math.random() - 0.5) * n,
                  d = l + a * (Math.random() - 0.5) * n;
                ((M["p" + i] = { x: r, y: l }),
                  gsap.to(M["p" + i], 0.6, { x: s, y: d }));
              }
              ((M.progress = 0),
                gsap.to(M, 0.8, {
                  progress: 1,
                  onUpdate: h,
                  onComplete: c,
                }));
            })());
        };
        var e,
          f,
          u,
          v,
          p,
          y = n,
          w = new PIXI.Graphics();
        y.addChild(w);
        var M = {};
      },
      t = function (n, a) {
        var f = function (n) {
          function i() {
            (v.clear(),
              v.lineStyle(d, h),
              v.moveTo(s.x, s.y),
              0 == u ? v.lineTo(r.x, r.y) : v.lineTo(l.x, l.y));
          }
          function o() {
            0 == u
              ? ((u = 1),
                (s = { x: r.x, y: r.y }),
                gsap.to(s, f, {
                  x: l.x,
                  y: l.y,
                  ease: Power1.easeOut,
                  onUpdate: i,
                  onComplete: o,
                }))
              : (v.clear(), (v.visible = !1));
          }
          this.play = function (n, a, e, t) {
            return (
              (v.visible = !0),
              (u = 0),
              (r = n),
              (l = a),
              (d = e),
              (h = t),
              (c = 0.2 * Math.random() + 0.2),
              (f = 0.2 * Math.random() + 0.2),
              (s = { x: r.x, y: r.y }),
              gsap.to(s, c, {
                x: l.x,
                y: l.y,
                ease: Power1.easeOut,
                onUpdate: i,
                onComplete: o,
              }),
              c + f
            );
          };
          var r,
            l,
            s,
            d,
            h,
            c,
            f,
            u,
            a = n,
            v = new PIXI.Graphics();
          a.addChild(v);
        };
        function u() {
          ((y.visible = !1), 0 <= v.id && C[v.id].push(v), e && e());
        }
        this.play = function (n) {
          ((e = n),
            (function () {
              (p.setChildIndex(y, p.children.length - 1),
                (y.visible = !0),
                (y.x = G / 2),
                (y.y = A / 2),
                (y.rotation = 0.5 * Math.PI * Math.floor(4 * Math.random())));
              for (
                var n,
                  a = Math.floor(7 * Math.random() + 2),
                  e = 0.8 * Math.min(G, A),
                  t = ((v.size = e) / a) * (0.4 * Math.random() + 0.7),
                  i = (e / a) * (0.4 * Math.random() + 0.1),
                  o = L(),
                  r = 0,
                  l = 0;
                l <= a;
                l++
              ) {
                var s = (l - 0.5 * a) * t,
                  d = { x: -e / 2, y: s },
                  h = { x: e / 2, y: s },
                  c = (n = w[l] ? w[l] : new f(y)).play(d, h, i, o);
                (r < c && (r = c), (w[l] = n));
              }
              gsap.delayedCall(r, u);
            })());
        };
        var v = this,
          p = n;
        this.id = a;
        var e,
          y = new PIXI.Container(),
          w = [];
        ((this.size = 0), (this.container = y), p.addChild(y));
      };
    function l(n, a) {
      for (var e = M.length, t = 0; t < e; t++) {
        var i = M[t];
        if (i.hitcheck(n, a)) return (u != i.id && i.play(), i.id);
      }
      return -1;
    }

    const activePointers = new Set();
    function keyId(event) {
      if (
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        about.open
      )
        return -1;
      if (
        event.target.closest(
          'input, textarea, select, [contenteditable="true"]',
        )
      )
        return -1;
      const key = event.code.startsWith("Key")
        ? event.code.slice(3)
        : event.code.startsWith("Digit")
          ? event.code.slice(5)
          : "";
      return key ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ012345".indexOf(key) : -1;
    }
    function a(event) {
      const id = keyId(event);
      if (id < 0 || event.repeat) return;
      event.preventDefault();
      c(id);
    }
    function e(event) {
      if (keyId(event) >= 0) c(-1);
    }
    function i(event) {
      if (event.button > 0 || about.open) return;
      view.setPointerCapture(event.pointerId);
      activePointers.add(event.pointerId);
      c(l(event.clientX, event.clientY));
      event.preventDefault();
    }
    function o(event) {
      if (!activePointers.has(event.pointerId) || about.open) return;
      c(l(event.clientX, event.clientY));
      event.preventDefault();
    }
    function h(event) {
      activePointers.delete(event.pointerId);
      if (!activePointers.size) c(-1);
    }
    function resetInput() {
      activePointers.clear();
      c(-1);
    }
    function c(n) {
      if (n < 0) {
        u = -1;
        return;
      }
      if (u === n || !playing || about.open) return;
      u = n;
      R.play(n % 32);
      onTap(n % 32);
      if (reducedMotion.matches) return;
      if (--x <= 0) {
        const type = Math.floor(I.length * Math.random());
        const id = type + m.length;
        (C[id].length ? C[id].pop() : new I[type](b, id)).play();
        x = 12 * Math.random() + 6;
      }
      const type = n % m.length;
      (C[type].length ? C[type].pop() : new m[type](b, type)).play();
    }
    ((this.resize = function () {
      if (w) {
        var n = 0,
          a = v,
          e = p;
        A < G && ((a = p), (e = v));
        for (var t = G / a, i = A / e, o = 0; o < e; o++)
          for (var r = 0; r < a; r++) {
            var l;
            (M[n] ? (l = M[n]) : ((l = new s(n, f)), (M[n] = l)),
              l.setPosition(t * r, i * o),
              l.setSize(t, i),
              n++);
          }
        T.resize();
      }
    }),
      (this.init = function () {
        ((w = !0),
          (b = new PIXI.Container()),
          z.addChild(b),
          (f = new PIXI.Container()),
          z.addChild(f),
          (T = new n(b)).setColor(0xc92b48, 0));
      }),
      (this.start = function () {
        view.addEventListener("pointerdown", i);
        view.addEventListener("pointermove", o);
        view.addEventListener("pointerup", h);
        view.addEventListener("pointercancel", h);
        view.addEventListener("lostpointercapture", h);
        document.addEventListener("keydown", a);
        document.addEventListener("keyup", e);
        window.addEventListener("blur", resetInput);
        view.style.cursor = "crosshair";
      }),
      (this.end = function () {
        view.removeEventListener("pointerdown", i);
        view.removeEventListener("pointermove", o);
        view.removeEventListener("pointerup", h);
        view.removeEventListener("pointercancel", h);
        view.removeEventListener("lostpointercapture", h);
        document.removeEventListener("keydown", a);
        document.removeEventListener("keyup", e);
        window.removeEventListener("blur", resetInput);
        resetInput();
        view.style.cursor = "auto";
      }));
    var f,
      u = -1,
      v = 4,
      p = 8,
      y = !1,
      w = !1,
      M = [],
      m = [
        function (n, a) {
          var s = function (n) {
            function l() {
              s.visible = !1;
            }
            this.play = function (n, a, e) {
              ((s.visible = !0), s.clear());
              var t = G * Math.random(),
                i = A * Math.random(),
                o = Math.min(G, A) * (0.03 * Math.random() + 0.02);
              (s.lineStyle(3 * Math.random() + 3, e),
                s.drawCircle(0, 0, o),
                (s.x = n),
                (s.y = a),
                (s.scale.x = 0),
                (s.scale.y = 0),
                (s.rotation = Math.random() * Math.PI));
              var r = 0.2 * Math.random() + 0.4;
              return (
                gsap.to(s, r, {
                  x: t,
                  y: i,
                  rotation: Math.random() * Math.PI,
                  ease: Power3.easeOut,
                  onComplete: l,
                }),
                gsap.to(s.scale, r, {
                  x: 1,
                  y: 1,
                  ease: Back.easeOut.config(1.7),
                }),
                r
              );
            };
            var a = n,
              s = new PIXI.Graphics();
            a.addChild(s);
          };
          function d() {
            ((f.visible = !1), C[e.id].push(e));
          }
          this.play = function () {
            !(function () {
              (h.setChildIndex(f, h.children.length - 1), (f.visible = !0));
              for (
                var n = 5 * Math.random() + 7,
                  a = 0,
                  e = G / 2,
                  t = A / 2,
                  i = L(),
                  o = 0;
                o < n;
                o++
              ) {
                var r;
                r = c[o] ? c[o] : new s(f);
                var l = (c[o] = r).play(e, t, i);
                a < l && (a = l);
              }
              gsap.delayedCall(a, d);
            })();
          };
          var e = this,
            h = n;
          this.id = a;
          var c = [],
            f = new PIXI.Container();
          h.addChild(f);
        },
        function (n, a) {
          var s = function (n) {
            function l() {
              s.visible = !1;
            }
            this.play = function (n, a, e) {
              ((s.visible = !0), s.clear());
              var t = G * Math.random(),
                i = A * Math.random(),
                o = Math.min(G, A) * (0.04 * Math.random() + 0.02);
              (s.beginFill(e),
                s.drawRect(-o / 2, -o / 2, o, o),
                (s.x = n),
                (s.y = a),
                (s.scale.x = 0),
                (s.scale.y = 0),
                (s.rotation = Math.random() * Math.PI));
              var r = 0.2 * Math.random() + 0.4;
              return (
                gsap.to(s, r, {
                  x: t,
                  y: i,
                  rotation: Math.random() * Math.PI,
                  ease: Power3.easeOut,
                  onComplete: l,
                }),
                gsap.to(s.scale, r, {
                  x: 1,
                  y: 1,
                  ease: Back.easeOut.config(1.7),
                }),
                r
              );
            };
            var a = n,
              s = new PIXI.Graphics();
            a.addChild(s);
          };
          function d() {
            ((f.visible = !1), C[e.id].push(e));
          }
          this.play = function () {
            !(function () {
              (h.setChildIndex(f, h.children.length - 1), (f.visible = !0));
              for (
                var n = 5 * Math.random() + 7,
                  a = 0,
                  e = G / 2,
                  t = A / 2,
                  i = L(),
                  o = 0;
                o < n;
                o++
              ) {
                var r;
                r = c[o] ? c[o] : new s(f);
                var l = (c[o] = r).play(e, t, i);
                a < l && (a = l);
              }
              gsap.delayedCall(a, d);
            })();
          };
          var e = this,
            h = n;
          this.id = a;
          var c = [],
            f = new PIXI.Container();
          h.addChild(f);
        },
        function (n, a) {
          var h = function (n) {
            function r() {
              (h.beginFill(l),
                h.drawCircle(0, 0, s),
                (h.scale.x = 0),
                (h.scale.y = 0),
                gsap.to(h.scale, 0.7, {
                  x: 1,
                  y: 1,
                  ease: Elastic.easeOut.config(1, 0.3),
                  onComplete: a,
                }));
            }
            function a() {
              gsap.to(h.scale, 0.4, {
                x: 0,
                y: 0,
                ease: Power2.easeOut,
                onComplete: e,
                delay: 0.1,
              });
            }
            function e() {
              ((h.visible = !1), d && d());
            }
            this.play = function (n, a, e, t, i, o) {
              ((h.visible = !0),
                h.clear(),
                (h.x = t),
                (h.y = i),
                (l = a),
                (s = e),
                (d = o),
                gsap.delayedCall(n, r));
            };
            var l,
              s,
              d,
              t = n,
              h = new PIXI.Graphics();
            t.addChild(h);
          };
          function c() {
            ((v.visible = !1), C[e.id].push(e));
          }
          this.play = function () {
            !(function () {
              (f.setChildIndex(v, f.children.length - 1),
                (v.visible = !0),
                (v.x = G / 2),
                (v.y = A / 2),
                (v.rotation = Math.random() * Math.PI * 2));
              for (
                var n = 10,
                  a = L(),
                  e = (Math.min(G, A) / 64) * (0.6 * Math.random() + 0.7),
                  t = 2,
                  i = 0;
                i < 40;
                i++
              ) {
                var o,
                  r = (25 * i * Math.PI) / 180,
                  l = n * Math.cos(r),
                  s = n * Math.sin(r);
                ((n += e),
                  (t += 0.22),
                  (o = u[i] ? u[i] : new h(v)),
                  (u[i] = o));
                var d = null;
                (39 == i && (d = c), o.play(0.03 * i, a, t, l, s, d));
              }
            })();
          };
          var e = this,
            f = n;
          this.id = a;
          var u = [],
            v = new PIXI.Container();
          f.addChild(v);
        },
        function (n, a) {
          function e() {
            C[t.id].push(t);
          }
          this.play = function () {
            o.play(0, e);
          };
          var t = this,
            i = n;
          this.id = a;
          var o = new r(i);
        },
        function (n, a) {
          function e() {
            C[t.id].push(t);
          }
          this.play = function () {
            o.play(1, e);
          };
          var t = this,
            i = n;
          this.id = a;
          var o = new r(i);
        },
        function (n, a) {
          function h() {
            ((f.visible = !1), C[e.id].push(e));
          }
          this.play = function () {
            !(function () {
              (c.setChildIndex(f, c.children.length - 1),
                (f.visible = !0),
                (f.x = G / 2),
                (f.y = A / 2));
              var n = L(),
                a = Math.min(G, A) * (0.28 * Math.random() + 0.2),
                e = Math.floor(5 * Math.random()) + 3;
              (u.clear(),
                u.lineStyle(7 * Math.random() + 4, n, 1),
                (u.rotation = 30 * Math.floor(6 * Math.random())));
              for (var t = 360 / e, i = 0; i <= e; i++) {
                var o = (i * t * Math.PI) / 180,
                  r = a * Math.cos(o),
                  l = a * Math.sin(o);
                0 == i ? u.moveTo(r, l) : u.lineTo(r, l);
              }
              var s = 0.8 * Math.random() + 0.4,
                d = 0.8 * Math.random() + 0.4;
              (gsap.fromTo(
                u.scale,
                0.9,
                { x: s, y: s },
                { x: d, y: d, ease: Bounce.easeOut },
              ),
                v.play(a, h));
            })();
          };
          var e = this,
            c = n;
          this.id = a;
          var f = new PIXI.Container(),
            u = new PIXI.Graphics();
          (c.addChild(f), f.addChild(u));
          var v = new d(f, u);
        },
        function (n, a) {
          var i = function (n) {
            function e() {
              var n = Math.min(G, A),
                a = n * (0.08 * Math.random() + 0.05);
              (l.lineStyle(4 * Math.random() + 4, L()),
                l.drawRect(-a / 2, -a / 2, a, a),
                (l.x = o + (n / 2) * (Math.random() - 0.5)),
                (l.y = r + (n / 2) * (Math.random() - 0.5)),
                (l.scale.x = 0),
                (l.scale.y = 0),
                (l.rotation = Math.random() * Math.PI),
                gsap.to(l, 0.5, {
                  x: o,
                  y: r,
                  rotation: 0,
                  ease: Back.easeOut.config(1.7),
                  onComplete: t,
                }),
                gsap.to(l.scale, 0.5, {
                  x: 1,
                  y: 1,
                  ease: Back.easeOut.config(1.7),
                }));
            }
            function t() {
              var n = Math.min(G, A),
                a = o + (n / 2) * (Math.random() - 0.5),
                e = r + (n / 2) * (Math.random() - 0.5);
              (gsap.to(l, 0.5, {
                x: a,
                y: e,
                rotation: -Math.random() * Math.PI,
                ease: Back.easeIn.config(1.7),
                onComplete: i,
                delay: 0.2,
              }),
                gsap.to(l.scale, 0.5, {
                  x: 0,
                  y: 0,
                  ease: Back.easeIn.config(1.7),
                  delay: 0.2,
                }));
            }
            function i() {
              l.visible = !1;
            }
            this.play = function (n, a) {
              ((l.visible = !0),
                l.clear(),
                (o = G * Math.random()),
                (r = A * Math.random()),
                gsap.delayedCall(n, e));
            };
            var o,
              r,
              a = n,
              l = new PIXI.Graphics();
            a.addChild(l);
          };
          function o() {
            ((l.visible = !1), C[e.id].push(e));
          }
          this.play = function () {
            !(function () {
              (r.setChildIndex(l, r.children.length - 1), (l.visible = !0));
              for (
                var n = Math.floor(5 * Math.random() + 5), a = 0;
                a < n;
                a++
              ) {
                var e;
                ((e = s[a] ? s[a] : new i(l)), (s[a] = e));
                var t = null;
                (a == n - 1 && (t = o), e.play(0.06 * a, t));
              }
            })();
          };
          var e = this,
            r = n;
          this.id = a;
          var l = new PIXI.Container();
          r.addChild(l);
          var s = [];
        },
        function (n, a) {
          var i = function (n) {
            function e() {
              var n = Math.min(G, A) * (0.05 * Math.random() + 0.014);
              (l.beginFill(L()),
                l.drawCircle(0, 0, n),
                (l.x = i),
                (l.y = o),
                (l.scale.x = 0),
                (l.scale.y = 0),
                gsap.to(l.scale, 0.5, {
                  x: 1,
                  y: 1,
                  ease: Elastic.easeOut.config(1, 0.3),
                  onComplete: a,
                }));
            }
            function a() {
              gsap.to(l.scale, 0.5, {
                x: 0,
                y: 0,
                ease: Back.easeIn.config(1.7),
                onComplete: t,
                delay: 0.2,
              });
            }
            function t() {
              l.visible = !1;
            }
            this.play = function (n, a) {
              ((l.visible = !0),
                l.clear(),
                (i = G * Math.random()),
                (o = A * Math.random()),
                gsap.delayedCall(n, e));
            };
            var i,
              o,
              r = n,
              l = new PIXI.Graphics();
            r.addChild(l);
          };
          function o() {
            ((l.visible = !1), C[e.id].push(e));
          }
          this.play = function () {
            !(function () {
              (r.setChildIndex(l, r.children.length - 1), (l.visible = !0));
              for (
                var n = Math.floor(5 * Math.random() + 5), a = 0;
                a < n;
                a++
              ) {
                var e;
                ((e = s[a] ? s[a] : new i(l)), (s[a] = e));
                var t = null;
                (a == n - 1 && (t = o), e.play(0.06 * a, t));
              }
            })();
          };
          var e = this,
            r = n;
          this.id = a;
          var l = new PIXI.Container();
          r.addChild(l);
          var s = [];
        },
        function (n, a) {
          function o() {
            ((l.visible = !1), C[e.id].push(e));
          }
          this.play = function () {
            !(function () {
              ((l.visible = !0),
                r.setChildIndex(l, r.children.length - 1),
                (d.container.mask = s),
                d.play(o));
              var n = d.size / 2;
              ((s.x = G / 2),
                (s.y = A / 2),
                s.clear(),
                s.beginFill(0),
                s.drawCircle(0, 0, n));
              var a = ((45 * Math.PI) / 180) * Math.floor(2 * Math.random()),
                e =
                  a +
                  ((45 * Math.PI) / 180) * Math.floor(4 * Math.random() - 2),
                t = 0.3 * Math.random() + 1,
                i = 0.3 * -Math.random() + 1;
              (gsap.fromTo(
                d.container,
                0.6,
                { rotation: a },
                { rotation: e, ease: Power2.easeOut },
              ),
                gsap.fromTo(
                  d.container.scale,
                  0.6,
                  { x: t, y: t },
                  { x: i, y: i, ease: Back.easeOut.config(1.7) },
                ),
                gsap.fromTo(
                  s.scale,
                  0.6,
                  { x: t, y: t },
                  { x: i, y: i, ease: Back.easeOut.config(1.7) },
                ));
            })();
          };
          var e = this,
            r = n;
          this.id = a;
          var l = new PIXI.Container();
          r.addChild(l);
          var s = new PIXI.Graphics();
          l.addChild(s);
          var d = new t(l, -1);
        },
        function (n, a) {
          function d() {
            ((c.visible = !1), C[e.id].push(e));
          }
          this.play = function () {
            !(function () {
              (h.setChildIndex(c, h.children.length - 1),
                c.clear(),
                (c.visible = !0),
                c.lineStyle(5 * Math.random() + 3, L(), 1),
                (c.x = G / 2),
                (c.y = A / 2));
              for (
                var n = 0.6 * Math.min(G, A),
                  a = Math.floor(5 * Math.random()) + 3,
                  e = 360 / a,
                  t = ((0.5 * Math.max(G, A)) / n) * (1.6 + 0.6 / a),
                  i = 0;
                i <= a;
                i++
              ) {
                var o = (i * e * Math.PI) / 180,
                  r = n * Math.cos(o),
                  l = n * Math.sin(o);
                0 == i ? c.moveTo(r, l) : c.lineTo(r, l);
              }
              var s = 0.3 * Math.random() + 0.6;
              (gsap.fromTo(
                c.scale,
                s,
                { x: 0, y: 0 },
                { x: t, y: t, onComplete: d, ease: Power2.easeOut },
              ),
                gsap.fromTo(
                  c,
                  s,
                  { rotation: Math.random() * Math.PI },
                  {
                    rotation: Math.random() * Math.PI,
                    ease: Power1.easeOut,
                  },
                ));
            })();
          };
          var e = this,
            h = n;
          this.id = a;
          var c = new PIXI.Graphics();
          h.addChild(c);
        },
        function (n, a) {
          function e() {
            ((o.visible = !1), C[t.id].push(t));
          }
          this.play = function () {
            !(function () {
              (i.setChildIndex(o, i.children.length - 1),
                (o.visible = !0),
                (o.x = G / 2),
                (o.y = A / 2));
              var n = L(),
                a = Math.min(G, A) * (0.25 * Math.random() + 0.1);
              (r.clear(), r.beginFill(n), r.drawCircle(0, 0, a), l.play(a, e));
            })();
          };
          var t = this,
            i = n;
          this.id = a;
          var o = new PIXI.Container(),
            r = new PIXI.Graphics();
          (i.addChild(o), o.addChild(r));
          var l = new d(o, r);
        },
        function (n, a) {
          var u = function (n) {
            function t() {
              (gsap.to(l.scale, 0.4, {
                x: 0,
                y: 0,
                ease: Back.easeIn.config(2),
                onComplete: a,
                delay: 0.7,
              }),
                gsap.to(l, 0.4, {
                  rotation: Math.random() * Math.PI * 2,
                  ease: Back.easeIn.config(2),
                  delay: 0.7,
                }));
            }
            function a() {
              ((l.visible = !1), i && i());
            }
            ((this.init = function (n, a, e, t) {
              ((o = e), (r = t), (l.x = n), (l.y = a));
            }),
              (this.play = function (n, a) {
                ((i = a),
                  l.clear(),
                  (l.visible = !0),
                  l.beginFill(r),
                  l.drawRect(0.5 * -o, 0.5 * -o, o, o),
                  gsap.fromTo(
                    l.scale,
                    0.3,
                    { x: 0, y: 0 },
                    {
                      x: 1,
                      y: 1,
                      ease: Back.easeOut.config(1.7),
                      onComplete: t,
                      delay: n,
                    },
                  ),
                  gsap.fromTo(
                    l,
                    0.7,
                    { rotation: Math.random() * Math.PI * 2 },
                    {
                      rotation: 0,
                      ease: Elastic.easeOut.config(1, 0.3),
                      delay: n,
                    },
                  ));
                var e = Math.random() * Math.PI;
                gsap.fromTo(
                  y,
                  1,
                  { rotation: 0 },
                  { rotation: e, ease: Bounce.easeOut, delay: n },
                );
              }));
            var i,
              o,
              r,
              e = n,
              l = new PIXI.Graphics();
            e.addChild(l);
          };
          function v() {
            ((y.visible = !1), C[e.id].push(e));
          }
          this.play = function () {
            !(function () {
              (p.setChildIndex(y, p.children.length - 1),
                (y.visible = !0),
                (y.x = G / 2),
                (y.y = A / 2));
              var n = Math.floor(8 * Math.random() + 6),
                a = Math.min(G, A) * (0.25 * Math.random() + 0.25),
                e = 360 / n,
                t = a * (0.15 * Math.random() + 0.05),
                i = L(),
                o = (Math.PI / 2) * Math.floor(4 * Math.random()),
                r = 1;
              Math.random() < 0.5 && (r = -1);
              for (var l = 0; l < n; l++) {
                var s,
                  d = ((r * e * l + o) * Math.PI) / 180,
                  h = a * Math.cos(d),
                  c = a * Math.sin(d);
                ((s = w[l] ? w[l] : new u(y)), (w[l] = s));
                var f = null;
                (l == n - 1 && (f = v),
                  s.init(h, c, t, i),
                  s.play(0.05 * l, f));
              }
            })();
          };
          var e = this,
            p = n;
          this.id = a;
          var y = new PIXI.Container(),
            w = [];
          p.addChild(y);
        },
        function (n, a) {
          var u = function (n) {
            function e() {
              var n = 0.5 * G,
                a = l.x + Math.random() * n - n / 2,
                e = l.y + Math.random() * n - n / 2;
              (gsap.to(l.scale, 0.3, {
                x: 0,
                y: 0,
                ease: Power1.easeOut,
                onComplete: t,
                delay: 0.5,
              }),
                gsap.to(l, 0.3, {
                  x: a,
                  y: e,
                  ease: Power2.easeOut,
                  delay: 0.5,
                }));
            }
            function t() {
              ((l.visible = !1), i && i());
            }
            ((this.init = function (n, a, e, t) {
              ((o = e), (r = t), (l.x = n), (l.y = a));
            }),
              (this.play = function (n, a) {
                ((i = a),
                  l.clear(),
                  (l.visible = !0),
                  l.beginFill(r),
                  l.drawCircle(0, 0, 0.5 * o),
                  gsap.fromTo(
                    l.scale,
                    0.3,
                    { x: 0, y: 0 },
                    {
                      x: 1,
                      y: 1,
                      ease: Back.easeOut.config(1.7),
                      onComplete: e,
                      delay: n,
                    },
                  ));
              }));
            var i,
              o,
              r,
              a = n,
              l = new PIXI.Graphics();
            a.addChild(l);
          };
          function v() {
            ((y.visible = !1), C[e.id].push(e));
          }
          this.play = function () {
            !(function () {
              (p.setChildIndex(y, p.children.length - 1),
                (y.visible = !0),
                (y.x = G / 2),
                (y.y = A / 2));
              var n = Math.floor(8 * Math.random() + 6),
                a = Math.min(G, A) * (0.2 * Math.random() + 0.25),
                e = 360 / n,
                t = a * (0.2 * Math.random() + 0.05),
                i = L(),
                o = (Math.PI / 2) * Math.floor(4 * Math.random()),
                r = 1;
              Math.random() < 0.5 && (r = -1);
              for (var l = 0; l < n; l++) {
                var s,
                  d = ((r * e * l + o) * Math.PI) / 180,
                  h = a * Math.cos(d),
                  c = a * Math.sin(d);
                ((s = w[l] ? w[l] : new u(y)), (w[l] = s));
                var f = null;
                (l == n - 1 && (f = v),
                  s.init(h, c, t, i),
                  s.play(0.05 * l, f));
              }
            })();
          };
          var e = this,
            p = n;
          this.id = a;
          var y = new PIXI.Container(),
            w = [];
          p.addChild(y);
        },
        function (n, a) {
          function i() {
            ((r.visible = !1), C[e.id].push(e));
          }
          this.play = function () {
            !(function () {
              ((r.visible = !0),
                o.setChildIndex(r, o.children.length - 1),
                (r.x = 0.2 * G + 0.6 * G * Math.random()),
                (r.y = 0.2 * A + 0.6 * A * Math.random()));
              var n,
                a = Math.min(G, A) * (0.7 + 0.2 * Math.random()),
                e = (a / 10) * (0.5 + 0.8 * Math.random()),
                t = L();
              (l.clear(),
                l.beginFill(t),
                l.drawRect(0, -e / 2, a, e),
                s.clear(),
                s.beginFill(t),
                s.drawRect(-e / 2, 0, e, a),
                (l.y = 0),
                (l.x = -a / 2),
                (s.x = 0),
                (s.y = -a / 2),
                (r.rotation = (45 * Math.PI) / 180),
                (l.scale.x = 0),
                (s.scale.y = 0),
                (n =
                  Math.random() < 0.5
                    ? (-135 * Math.PI) / 180
                    : (215 * Math.PI) / 180),
                new TimelineLite()
                  .to(l.scale, 0.4, { x: 1, ease: Power2.easeOut })
                  .to(s.scale, 0.4, { y: 1, ease: Power2.easeOut }, 0.1)
                  .to(
                    r,
                    0.6,
                    { rotation: n, ease: Back.easeOut.config(1.7) },
                    0,
                  )
                  .to(l.scale, 0.3, { x: 0, ease: Power2.easeOut })
                  .to(
                    s.scale,
                    0.3,
                    { y: 0, ease: Power2.easeOut, onComplete: i },
                    0.6,
                  ));
            })();
          };
          var e = this,
            o = n;
          this.id = a;
          var r = new PIXI.Container(),
            l = new PIXI.Graphics(),
            s = new PIXI.Graphics();
          (o.addChild(r), r.addChild(l), r.addChild(s));
        },
        function (n, a) {
          function o() {
            if (r < ++c)
              switch (l) {
                case 0:
                  l = 1;
                  var n = h[0];
                  ((f.x = n.x), (f.y = n.y), (c = 0), o());
                  break;
                case 1:
                  l = 2;
              }
            else
              gsap.to(f, 0.1, {
                x: h[c].x,
                y: h[c].y,
                onComplete: o,
                onUpdate: e,
                ease: Power1.easeOut,
              });
          }
          function e() {
            switch ((u.clear(), u.lineStyle(s, d, 1), l)) {
              case 0:
                u.moveTo(h[0].x, h[0].y);
                for (var n = 1; n < c; n++) u.lineTo(h[n].x, h[n].y);
                u.lineTo(f.x, f.y);
                break;
              case 1:
                for (u.moveTo(f.x, f.y), n = c; n <= r; n++)
                  u.lineTo(h[n].x, h[n].y);
            }
          }
          this.play = function () {
            !(function () {
              (u.clear(),
                (u.visible = !0),
                Math.random() < 0.5
                  ? ((u.x = 0), (u.y = 0), (u.rotation = 0))
                  : ((u.x = G), (u.y = A), (u.rotation = Math.PI)),
                (c = l = 0),
                (r = Math.floor(3 * Math.random()) + 3),
                (s = 20 * Math.random() + 2),
                (d = L()));
              var n,
                a = Math.random() < 0.5;
              n = a ? G / r : A / r;
              for (var e = 0; e <= r; e++) {
                var t;
                (a
                  ? ((t = { x: e * n, y: A * Math.random() }),
                    0 == e && (t.x -= 10),
                    e == r && (t.x += 10))
                  : ((t = { y: e * n, x: G * Math.random() }),
                    0 == e && (t.y -= 10),
                    e == r && (t.y += 10)),
                  (h[e] = t));
              }
              var i = h[0];
              ((f.x = i.x), (f.y = i.y), o());
            })();
          };
          var t = n;
          this.id = a;
          var r,
            l,
            s,
            d,
            h = [],
            c = 0,
            f = { x: 0, y: 0 },
            u = new PIXI.Graphics();
          t.addChild(u);
        },
        t,
      ],
      I = [
        function (n, a) {
          function d() {
            (y.clear(),
              y.beginFill(c),
              y.moveTo(u.pos.b1.x, u.pos.b1.y),
              y.lineTo(u.pos.b0.x, u.pos.b0.y));
            for (var n = 0; u.pos["p" + n]; n++) {
              var a = u.pos["p" + n];
              y.lineTo(a.x, a.y);
            }
            y.endFill();
          }
          function h() {
            (F == w && T.setColor(c, p - 1), (y.visible = !1), C[u.id].push(u));
          }
          this.play = function () {
            !(function () {
              F = w;
              var n = X();
              ((c = P[n]),
                (O = n),
                y.clear(),
                (y.visible = !0),
                (p = v.children.length - 1 - Math.floor(2 * Math.random())),
                v.setChildIndex(y, p));
              var a = Math.random() < 0.5,
                e = Math.floor(4 * Math.random()) + 1;
              u.pos = {};
              var t = 0;
              (a
                ? ((t = A / e),
                  (u.pos.b0 = { x: 0, y: 0 }),
                  (u.pos.b1 = { x: 0, y: A }))
                : ((t = G / e),
                  (u.pos.b0 = { x: 0, y: 0 }),
                  (u.pos.b1 = { x: G, y: 0 })),
                Math.random() < 0.5
                  ? ((y.rotation = 0), (y.x = 0), (y.y = 0))
                  : ((y.rotation = Math.PI), (y.x = G), (y.y = A)));
              for (var i = (f = 0); i <= e; i++) {
                var o = { x: 0, y: 0 },
                  r = 0;
                (0 != i && i != e && (r = (t / 4) * Math.random() - t / 8),
                  a ? (o.y = t * i + r) : (o.x = t * i + r),
                  (u.pos["p" + i] = o));
                var l,
                  s = 0.4 * Math.random() + 0.3;
                ((f = 2),
                  (l = a ? { x: G } : { y: A }),
                  gsap.to(u.pos["p" + i], s, l));
              }
              ((u.progress = 0),
                gsap.to(u, f, {
                  progress: 1,
                  ease: Power0.easeNone,
                  onUpdate: d,
                  onComplete: h,
                }));
            })();
          };
          var c,
            f,
            u = this,
            v = n;
          ((this.id = a), (this.progress = 0), (this.pos = {}));
          var p = 0,
            y = new PIXI.Graphics();
          v.addChild(y);
          var w = Math.floor(performance.now());
        },
      ];
    shuffle(m);
    for (
      var b, x = 16 * Math.random(), C = [], g = 0;
      g < m.length + I.length;
      g++
    )
      C[g] = [];
    var T,
      P = [
        0xad2445, 0xc92b48, 0x931f42, 0xb62b3e, 0x8c2542, 0xd23950, 0x7b2440,
        0xa63151, 0xa7263a, 0x9b2955, 0xc52c42, 0xb42a50,
      ],
      k = [
        0xfff8ec, 0xffb6c1, 0xff7a87, 0xffd797, 0xf36b71, 0xf7c8cd, 0xf8e6d7,
        0xfca096, 0xe8b2c9, 0xffd4b5, 0xf8a2b4, 0xeeb6b5,
      ],
      _ = P.length,
      O = 0;
    function L() {
      var n = Math.random();
      return n < 0.03 ? 0x29232d : n < 0.18 ? 0xfff8ec : k[X()];
    }
    function X() {
      for (var n = 0; n < 10; n++) {
        var a = Math.floor(_ * Math.random());
        if (2 < Math.abs(O - a)) break;
      }
      return a;
    }
    var F = 0;
  })();

  g.init();
  function resize() {
    G = innerWidth;
    A = innerHeight;
    renderer.resize(G, A);
    g.resize();
    if (playing) renderer.render(z);
  }
  resize();
  window.addEventListener("resize", resize);
  function frame() {
    if (playing && !document.hidden) renderer.render(z);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  $("#scene_top").style.display = "block";
  const supported = Boolean(window.AudioContext || window.webkitAudioContext);
  $(".ok").hidden = !supported;
  $("#ng").style.display = supported ? "none" : "block";
  showToggle("#bt_feedback", U);
  showToggle("#bt_backtrack", backtrack);

  function startPlaying() {
    loading = false;
    playing = true;
    window.scrollTo(0, 0);
    document.body.classList.add("is-playing");
    view.removeAttribute("aria-hidden");
    $("#scene_top").style.display = "none";
    $("#scene_loading").style.display = "none";
    $("#scene_main").style.display = "block";
    $("#bt_start").disabled = false;
    taps = 0;
    $("#tap_count").textContent = "000";
    $("#sound_label").textContent = "LET'S TETO.";
    g.start();
    renderer.render(z);
    view.focus({ preventScroll: true });
    if (backtrack && !document.hidden) beat.start();
  }
  function goHome() {
    if (!playing) return;
    playing = false;
    g.end();
    beat.stop();
    audio.stop();
    document.body.classList.remove("is-playing");
    view.setAttribute("aria-hidden", "true");
    $("#scene_main").style.display = "none";
    $("#scene_top").style.display = "block";
    $("#bt_start").focus({ preventScroll: true });
  }
  function resumePlayback() {
    if (!playing || about.open || document.hidden) return;
    audio
      .unlock()
      .then(() => {
        if (backtrack && playing && !about.open && !document.hidden)
          beat.start();
      })
      .catch(() => {});
  }
  $("#bt_start").addEventListener("click", async () => {
    if (playing || loading) return;
    loading = true;
    $("#bt_start").disabled = true;
    try {
      // Construct and resume the context in this user gesture for iOS/Safari.
      await audio.unlock();
      if (!ready) {
        $("#scene_top").style.display = "none";
        $("#scene_loading").style.display = "block";
        await audio.load((progress) => {
          if (!loading) return;
          const percent = Math.round(progress * 100);
          $("#loading_progress").style.width = `${percent}%`;
          $("#loading_percent").textContent = `${percent}%`;
          $(".loading-track").setAttribute("aria-valuenow", String(percent));
        });
        ready = true;
      }
      startPlaying();
    } catch (_) {
      beat.stop();
      audio.stop();
      loading = false;
      $("#scene_top").style.display = "none";
      $("#scene_loading").style.display = "block";
      $("#scene_loading h2").textContent = "Teto 還沒準備好。";
      $("#loading_message").textContent =
        "聲音載入失敗，請重新載入後再試一次。";
      $("#bt_retry").hidden = false;
      $("#bt_retry").focus();
    }
  });
  $("#bt_retry").addEventListener("click", () => location.reload());
  $("#bt_back").addEventListener("click", goHome);
  $("#bt_feedback").addEventListener("click", () => {
    U = !U;
    showToggle("#bt_feedback", U);
    save("feedback", U);
  });
  $("#bt_backtrack").addEventListener("click", () => {
    backtrack = !backtrack;
    showToggle("#bt_backtrack", backtrack);
    save("backtrack", backtrack);
    if (backtrack && playing && !about.open && !document.hidden) beat.start();
    else beat.stop();
  });
  document.querySelectorAll("[data-about]").forEach((button) =>
    button.addEventListener("click", () => {
      if (about.open) return;
      beat.stop();
      audio.stop();
      about.showModal();
    }),
  );
  $("#bt_close").addEventListener("click", () => about.close());
  about.addEventListener("click", (event) => {
    const box = about.getBoundingClientRect();
    if (
      event.target === about &&
      (event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom)
    )
      about.close();
  });
  about.addEventListener("close", () => {
    if (playing) {
      view.focus({ preventScroll: true });
      resumePlayback();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !about.open) goHome();
  });
  document.addEventListener("visibilitychange", () => {
    if (!audio.context) return;
    if (document.hidden) {
      beat.stop();
      audio.stop();
      audio.context.suspend().catch(() => {});
    } else if (playing && !about.open) {
      resumePlayback();
    }
  });
  // A later touch also resumes audio after a mobile browser interruption.
  view.addEventListener("pointerdown", () => {
    if (playing && audio.context.state !== "running") resumePlayback();
  });
  if (document.fullscreenEnabled || document.webkitFullscreenEnabled) {
    $("#bt_fs").style.visibility = "visible";
    $("#bt_fs").addEventListener("click", async () => {
      try {
        if (document.fullscreenElement || document.webkitFullscreenElement) {
          await (document.exitFullscreen || document.webkitExitFullscreen).call(
            document,
          );
        } else {
          await (
            document.documentElement.requestFullscreen ||
            document.documentElement.webkitRequestFullscreen
          ).call(document.documentElement);
        }
      } catch (_) {
        /* Fullscreen may be disabled by an embedding page. */
      }
    });
  }
}

initTetotap();
