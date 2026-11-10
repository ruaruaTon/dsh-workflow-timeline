/* @local/workflow-timeline · client v6（ZCode 横向时间线 + 表情状态机 + 点击开子会话 + phase 模型覆盖真通 + 头部「🗑 清空全部」：
   ⚙ 保存写 ~/.dsh/workflow-overrides.json（workflowName+phaseTitle 键控，Router 下发时转 args.modelOverrides），
   显示源三级回显=覆盖 > meta.phases 声明 > 继承全局；
   🗑 清空全部=POST api/workflow-timeline/delete-all，host 立即落盘，重启不复活） */
window.__ModuleLoader__.load({
  id: "@local/workflow-timeline",
  factory(require) {
    const React = require("react");
    const h = React.createElement;

    /* ══════════ 表情状态机（移植自 ZCode workflow-face-motion.ts）══════════ */
    const FACE_COLORS = ["#54B9A6", "#F19D38", "#6464EF", "#885CF5", "#3C82F6", "#ED712E", "#EB4699", "#5BC67A", "#EA4045"];
    const FACE_STATE = { done: "content", running: "scanning", pending: "waiting", failed: "sad" };
    const BASE_EXPR = { waiting: "dots", scanning: "pill", content: "happy", sad: "sad" };
    const SPECIAL = { scanning: ["focused", "confused"], waiting: [], content: [], sad: [] };

    function startFaceMotion(face, state) {
      const media = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
      let timer = undefined, visible = true, rounds = 0, lookingLeft = false, previous = undefined;
      const random = function (min, max) { return min + Math.random() * (max - min); };
      const later = function (delay, action) { timer = setTimeout(action, delay); };
      const motion = function (value) { face.dataset.motion = value; };
      const setVar = function (k, v) { face.style.setProperty(k, v); };
      const base = function () {
        face.dataset.expression = BASE_EXPR[state];
        motion("idle");
        setVar("--wft-face-x", "0px");
        setVar("--wft-face-y", state === "sad" ? "0.3px" : "0px");
      };
      const pause = function () {
        motion("idle");
        later(
          state === "waiting" ? random(3000, 6000) : state === "scanning" ? random(3000, 7000) : state === "sad" ? random(3600, 8000) : random(12000, 20000),
          cycle
        );
      };
      const morph = function (expression, next) {
        motion("morph");
        later(80, function () {
          face.dataset.expression = expression;
          later(100, function () { motion("idle"); next(); });
        });
      };
      const maybeExpression = function () {
        rounds++;
        const probability = state === "scanning" ? 0.45 : 0.25;
        if (rounds < 2 || Math.random() >= probability) { pause(); return; }
        const pool = SPECIAL[state].filter(function (e) { return e !== previous; });
        const list = pool.length ? pool : SPECIAL[state];
        const expression = list[Math.floor(Math.random() * list.length)];
        previous = expression;
        rounds = 0;
        const hold = expression === "confused" ? random(2200, 3800) : random(800, 1800);
        morph(expression, function () { later(hold, function () { morph(BASE_EXPR[state], pause); }); });
      };
      const glance = function () {
        motion("glance");
        lookingLeft = !lookingLeft;
        setVar("--wft-face-x", lookingLeft ? "-4px" : "0px");
        later(360, maybeExpression);
      };
      function cycle() {
        if (state === "waiting") {
          motion("dots-wave");
          later(900, pause);
          return;
        }
        if (state === "sad") {
          const floats = Math.random() < 0.5 ? 1 : 2;
          setVar("--wft-floats", String(floats));
          motion("float");
          later(floats * 600, function () {
            if (Math.random() >= 0.4) { pause(); return; }
            morph("focused", function () {
              const shakes = 3 + Math.floor(Math.random() * 3);
              setVar("--wft-shakes", String(shakes));
              motion("shake");
              later(shakes * 90, function () {
                motion("idle");
                later(random(500, 1000), function () { morph("sad", pause); });
              });
            });
          });
          return;
        }
        if (state === "content") {
          const hops = Math.random() < 0.5 ? 2 : 3;
          setVar("--wft-hops", String(hops));
          motion("hop");
          later(hops * 240, function () {
            face.dataset.expression = "pill";
            motion("idle");
            later(250, function () {
              const duration = random(390, 480);
              setVar("--wft-blinks", "1");
              setVar("--wft-blink-time", duration + "ms");
              motion("blink");
              later(duration, function () {
                face.dataset.expression = "happy";
                pause();
              });
            });
          });
        } else {
          const blinks = Math.random() < 0.5 ? 2 : 3;
          const duration = state === "scanning" ? random(300, 390) : random(390, 480);
          setVar("--wft-blinks", String(blinks));
          setVar("--wft-blink-time", duration + "ms");
          motion("blink");
          later(duration * blinks, glance);
        }
      }
      const restart = function () {
        clearTimeout(timer);
        timer = undefined;
        rounds = 0;
        lookingLeft = false;
        base();
        if (!document.hidden && !(media && media.matches) && visible) later(random(2400, 5600), cycle);
      };
      let observer;
      if (typeof IntersectionObserver !== "undefined") {
        observer = new IntersectionObserver(function (entries) {
          const next = entries[0] ? entries[0].isIntersecting : true;
          if (next !== visible) { visible = next; restart(); }
        });
        observer.observe(face);
      }
      document.addEventListener("visibilitychange", restart);
      if (media && media.addEventListener) media.addEventListener("change", restart);
      restart();
      return function () {
        clearTimeout(timer);
        if (observer) observer.disconnect();
        document.removeEventListener("visibilitychange", restart);
        if (media && media.removeEventListener) media.removeEventListener("change", restart);
        base();
      };
    }

    /* 表情眼型（dots/pill/happy/sleepy/focused/sad/confused）*/
    function eyes() {
      const dots = h("g", { "data-eye-expression": "dots", fill: "#fff" },
        h("circle", { cx: 5, cy: 10, r: 1.5 }), h("circle", { cx: 10, cy: 10, r: 1.5 }), h("circle", { cx: 15, cy: 10, r: 1.5 }));
      const pill = h("g", { "data-eye-expression": "pill", fill: "#fff" },
        h("rect", { x: 5, y: 8.7, width: 4.4, height: 2.6, rx: 1.3 }), h("rect", { x: 10.6, y: 8.7, width: 4.4, height: 2.6, rx: 1.3 }));
      const happy = h("g", { "data-eye-expression": "happy", stroke: "#fff", strokeWidth: 1.7, fill: "none", strokeLinecap: "round" },
        h("path", { d: "M5,11 V9.4 A2,2 0 0 1 9,9.4 V11" }), h("path", { d: "M11,11 V9.4 A2,2 0 0 1 15,9.4 V11" }));
      const sleepy = h("g", { "data-eye-expression": "sleepy", fill: "#fff" },
        h("path", { d: "M4.5,8 L8,9.2 V11 A2,2 0 0 1 4.5,10.4 Z" }),
        h("path", { d: "M11.5,9.2 L15,8 V10.4 A2,2 0 0 1 11.5,11 Z" }));
      const focused = h("g", { "data-eye-expression": "focused", fill: "#fff" },
        h("path", { d: "M4,6.5 L8,9 V11 A2,2 0 0 1 4,10.5 Z" }),
        h("path", { d: "M12,9 L16,6.5 V10.5 A2,2 0 0 1 12,11 Z" }));
      const sad = h("g", { "data-eye-expression": "sad", fill: "#fff" },
        h("circle", { cx: 7, cy: 10.4, r: 1.5 }), h("circle", { cx: 13, cy: 10.4, r: 1.5 }),
        h("path", { d: "M7.5,15 q2.5,-2 5,0", stroke: "#fff", strokeWidth: 1.1, fill: "none", strokeLinecap: "round" }));
      const confused = h("g", { "data-eye-expression": "confused", fill: "#fff" },
        h("rect", { x: 4.6, y: 7.2, width: 3.6, height: 4.6, rx: 1.8, transform: "rotate(-8 6.4 9.5)" }),
        h("rect", { x: 11.2, y: 8.6, width: 3.4, height: 3.2, rx: 1.6, transform: "rotate(6 12.9 10.2)" }));
      return h("g", { className: "wft-face-eyes" },
        h("g", { className: "wft-face-bounce" },
          h("g", { className: "wft-face-lids" }, dots, pill, happy, sleepy, focused, sad, confused)
        )
      );
    }

    function Face(props) {
      const ref = React.useRef(null);
      const state = FACE_STATE[props.status] || "waiting";
      React.useEffect(function () {
        if (!ref.current) return;
        const stop = startFaceMotion(ref.current, state);
        return stop;
      }, [state]);
      const body = FACE_COLORS[((props.seq || 0) % 9 + 9) % 9];
      return h("svg", {
        ref: ref,
        viewBox: "0 0 20 20",
        width: 18,
        height: 18,
        className: "wft-face",
        "data-face-state": state,
        "data-expression": BASE_EXPR[state],
        "data-motion": "idle",
        style: { display: "block", flex: "0 0 auto", borderRadius: 5, overflow: "visible" }
      },
        h("rect", { width: 20, height: 20, rx: 7, fill: body }),
        eyes(),
        h("g", { className: "wft-face-closed", fill: "#fff" },
          h("rect", { x: 4.8, y: 8.9, width: 4.4, height: 2.2, rx: 1.1 }),
          h("rect", { x: 10.8, y: 8.9, width: 4.4, height: 2.2, rx: 1.1 }))
      );
    }

    /* ══════════ 名册折叠（roster-model.ts）══════════ */
    const ROSTER_THRESHOLD = 6, ROSTER_PINS = 5, ROSTER_DECK = 3;
    const ATTENTION = ["failed", "running", "pending", "done"];
    function rosterOf(pills) {
      if (pills.length <= ROSTER_THRESHOLD) return { pills: pills, more: null };
      const pinned = [];
      const pin = function (p) { if (pinned.length < ROSTER_PINS && pinned.indexOf(p) < 0) pinned.push(p); };
      pills.forEach(function (p) { if (p.status === "running") pin(p); });
      pills.forEach(function (p) { if (p.status === "failed") pin(p); });
      pills.forEach(function (p) { pin(p); });
      const rest = pills.filter(function (p) { return pinned.indexOf(p) < 0; });
      const failedHidden = pills.filter(function (p) { return p.status === "failed"; }).length - pinned.filter(function (p) { return p.status === "failed"; }).length;
      const deck = [];
      ATTENTION.forEach(function (s) { rest.forEach(function (p) { if (p.status === s && deck.length < ROSTER_DECK) deck.push(p); }); });
      return { pills: pinned, more: { count: rest.length, deck: deck, failedHidden: failedHidden } };
    }

    /* ══════════ 样式 ══════════ */
    const STYLE_ID = "wft-style-v6";
    const CSS = [
      ".wft-panel{display:flex;flex-direction:column;height:100%;overflow:hidden;color:var(--dsw-alias-label-foreground,rgba(255,255,255,.87));font-size:13px}",
      ".wft-head{display:flex;align-items:center;gap:10px;padding:14px 18px 10px;flex:none}",
      ".wft-title{font-weight:600;font-size:15px}",
      ".wft-sub{font-size:11px;opacity:.55;font-family:Consolas,monospace}",
      ".wft-head-spacer{flex:1 1 auto}",
      ".wft-clear{display:flex;align-items:center;gap:5px;background:transparent;border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.6);border-radius:6px;padding:2px 9px;font-size:11.5px;cursor:pointer;flex:0 0 auto;transition:color .15s,border-color .15s,background .15s}",
      ".wft-clear:hover{border-color:#f85149;color:#f85149;background:rgba(248,81,73,.08)}",
      ".wft-clear:disabled{opacity:.45;cursor:default}",
      ".wft-clear:disabled:hover{border-color:rgba(255,255,255,.15);color:rgba(255,255,255,.6);background:transparent}",
      ".wft-live{width:8px;height:8px;border-radius:50%;background:#3fb950}",
      ".wft-live.running{background:#e3a33a;animation:wft-beat 1.6s cubic-bezier(.22,.61,.36,1) infinite}",
      "@keyframes wft-beat{50%{box-shadow:0 0 0 5px rgba(205,137,0,.18)}}",
      ".wft-scroll{flex:1;overflow:auto;padding:0 18px 24px}",
      ".wft-empty{padding:60px 0;text-align:center;opacity:.5;white-space:pre-line}",
      ".wft-run{border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.025);margin-bottom:14px;overflow:hidden}",
      ".wft-run-head{display:flex;align-items:center;gap:8px;padding:10px 14px;cursor:pointer}",
      ".wft-run-head:hover{background:rgba(255,255,255,.03)}",
      ".wft-run-name{font-weight:600;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".wft-run-meta{font-size:10.5px;opacity:.5;font-family:Consolas,monospace;white-space:nowrap}",
      ".wft-dot{width:9px;height:9px;border-radius:50%;flex:none}",
      ".wft-run-body{display:none;border-top:1px solid rgba(255,255,255,.06)}",
      ".wft-run.open .wft-run-body{display:block}",
      ".wft-track{display:flex;align-items:flex-start;padding:18px 14px 14px;overflow-x:auto}",
      ".wft-station{min-width:190px;max-width:280px;flex:0 0 auto;display:flex;flex-direction:column;margin-right:22px}",
      ".wft-station:last-child{margin-right:0}",
      ".wft-rail{position:relative;height:20px;display:flex;align-items:center;margin-bottom:6px}",
      ".wft-rail-line{position:absolute;left:10px;right:-22px;top:9px;height:0;border-top:1px solid rgba(255,255,255,.22)}",
      ".wft-station:last-child .wft-rail-line{right:0}",
      ".wft-lamp{position:relative;z-index:1;width:10px;height:10px;border-radius:50%;background:#3fb950;flex:none}",
      ".wft-lamp.running{background:#e3a33a;animation:wft-beat 1.6s cubic-bezier(.22,.61,.36,1) infinite}",
      ".wft-lamp.failed{background:#f85149}",
      ".wft-station-label{display:flex;align-items:center;gap:8px;font-size:11.5px;font-weight:600;opacity:.85;margin-bottom:2px;white-space:nowrap}",
      ".wft-station-cnt{font-size:10px;opacity:.5;font-family:Consolas,monospace;font-weight:400}",
      ".wft-pill{display:flex;align-items:center;gap:8px;height:30px;padding:0 10px 0 8px;border-radius:999px;background:rgba(255,255,255,.05);margin-bottom:5px;width:100%;min-width:0;transition:background .16s}",
      ".wft-pill:hover{background:rgba(255,255,255,.09)}",
      ".wft-pill.clickable{cursor:pointer}",
      ".wft-pill-name{font-size:11.5px;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.8}",
      ".wft-mark{width:14px;height:14px;flex:none;color:rgba(255,255,255,.5)}",
      ".wft-mark.failed{color:#f85149}",
      ".wft-more{display:flex;align-items:center;gap:8px;height:30px;padding:0 10px 0 8px;border-radius:999px;background:rgba(255,255,255,.05);font-size:11px;opacity:.75;cursor:pointer;width:100%;min-width:0}",
      ".wft-more:hover{background:rgba(255,255,255,.09)}",
      ".wft-deck{display:flex;flex:none}",
      ".wft-deck-face{border-radius:5px;overflow:hidden;margin-left:-6px;display:flex}",
      ".wft-deck-face:first-child{margin-left:0}",
      ".wft-spin{animation:wft-rotate 1s linear infinite;transform-box:view-box;transform-origin:50% 50%}",
      "@keyframes wft-rotate{to{transform:rotate(360deg)}}",
      /* ══ 表情动画（ZCode 同款语义）══ */
      ".wft-face{overflow:visible}",
      ".wft-face [data-eye-expression]{display:none}",
      ".wft-face[data-expression=dots] [data-eye-expression=dots]{display:inline}",
      ".wft-face[data-expression=pill] [data-eye-expression=pill]{display:inline}",
      ".wft-face[data-expression=happy] [data-eye-expression=happy]{display:inline}",
      ".wft-face[data-expression=sleepy] [data-eye-expression=sleepy]{display:inline}",
      ".wft-face[data-expression=focused] [data-eye-expression=focused]{display:inline}",
      ".wft-face[data-expression=sad] [data-eye-expression=sad]{display:inline}",
      ".wft-face[data-expression=confused] [data-eye-expression=confused]{display:inline}",
      ".wft-face .wft-face-closed{display:none}",
      ".wft-face[data-motion=blink] [data-eye-expression]{display:none !important}",
      ".wft-face[data-motion=blink] .wft-face-closed{display:inline;animation:wft-closed-blink var(--wft-blink-time,.23s) ease-in-out var(--wft-blinks,2);transform-box:fill-box;transform-origin:50%}",
      "@keyframes wft-closed-blink{0%,100%{transform:scaleY(0)}45%,55%{transform:scaleY(1)}}",
      ".wft-face-eyes{transform:translate(var(--wft-face-x,0px),var(--wft-face-y,0px));transition:transform .36s ease-in-out}",
      ".wft-face-bounce{transform-box:fill-box;transform-origin:50% 100%}",
      ".wft-face[data-motion=hop] .wft-face-bounce{animation:wft-hop .24s ease-in-out var(--wft-hops,2)}",
      "@keyframes wft-hop{0%,100%{transform:translateY(0)}50%{transform:translateY(-2.6px)}}",
      ".wft-face[data-motion=float] .wft-face-bounce{animation:wft-float .6s ease-in-out var(--wft-floats,1)}",
      "@keyframes wft-float{0%,100%{transform:translateY(0)}50%{transform:translateY(1.6px)}}",
      ".wft-face[data-motion=shake] .wft-face-bounce{animation:wft-shake .09s linear var(--wft-shakes,3)}",
      "@keyframes wft-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-.9px)}75%{transform:translateX(.9px)}}",
      ".wft-face[data-motion=dots-wave] [data-eye-expression=dots] circle{animation:wft-dot-float .5s ease-in-out both}",
      ".wft-face[data-motion=dots-wave] [data-eye-expression=dots] circle:nth-child(2){animation-delay:.16s}",
      ".wft-face[data-motion=dots-wave] [data-eye-expression=dots] circle:nth-child(3){animation-delay:.32s}",
      "@keyframes wft-dot-float{50%{transform:translateY(-1.3px)}}",
      ".wft-face[data-motion=morph] .wft-face-lids{animation:wft-lids-morph .18s ease-in-out;transform-box:fill-box;transform-origin:50%}",
      "@keyframes wft-lids-morph{50%{transform:scaleY(.4)}}",
      ".wft-collapsed{margin:6px 0 4px 24px;padding:8px 10px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:rgba(255,255,255,.02)}",
      ".wft-collapsed-row{display:flex;align-items:center;gap:6px;height:22px;padding:0 7px;border-radius:5px;background:rgba(255,255,255,.04);margin-bottom:4px;font-size:10.5px;opacity:.8}",
      ".wft-foot{padding:8px 14px 12px;font-size:10px;opacity:.35;font-family:Consolas,monospace;border-top:1px dashed rgba(255,255,255,.06)}",
      ".wft-panel select{background:#262626;color:#e8e8e8}",
      ".wft-panel select option, .wft-panel select optgroup{background:#262626;color:#e8e8e8}",
      /* 窄容器（右栏）纵向时间线 */
      ".wft-panel.narrow .wft-track{flex-direction:column;padding:14px}",
      ".wft-panel.narrow .wft-station{min-width:0;max-width:none;width:100%;margin:0 0 18px;position:relative;padding-left:26px;box-sizing:border-box}",
      ".wft-panel.narrow .wft-station::before{content:\"\";position:absolute;left:9px;top:16px;bottom:-18px;width:0;border-left:1px solid rgba(255,255,255,.22)}",
      ".wft-panel.narrow .wft-station:last-child{margin-bottom:0}",
      ".wft-panel.narrow .wft-station:last-child::before{display:none}",
      ".wft-panel.narrow .wft-rail{display:none}",
      ".wft-panel.narrow .wft-editor{padding:8px}",
      ".wft-panel.narrow .wft-editor-row{flex-wrap:wrap}",
      ".wft-panel.narrow .wft-station-label{gap:5px}"
    ].join("\n");

    function StatusMark(status) {
      if (status === "running") return h("svg", { viewBox: "0 0 24 24", width: 14, height: 14, fill: "none", stroke: "currentColor", strokeWidth: 2, className: "wft-spin" },
        h("path", { d: "M21 12a9 9 0 1 1-6.2-8.56", strokeLinecap: "round" }));
      if (status === "done") return h("svg", { viewBox: "0 0 24 24", width: 14, height: 14, fill: "none", stroke: "currentColor", strokeWidth: 2 },
        h("circle", { cx: 12, cy: 12, r: 10 }), h("path", { d: "m9 12 2 2 4-4" }));
      if (status === "failed") return h("svg", { viewBox: "0 0 24 24", width: 14, height: 14, fill: "none", stroke: "currentColor", strokeWidth: 2, className: "wft-mark failed" },
        h("circle", { cx: 12, cy: 12, r: 10 }), h("path", { d: "m15 9-6 6m0-6 6 6" }));
      return h("span", { style: { width: 14, height: 14 } });
    }

    function Pill(props) {
      const pill = props.pill, onOpen = props.onOpen, delay = props.delay || 0;
      const clickable = !!pill.childId && typeof onOpen === "function";
      return h("div", {
        className: "wft-pill" + (clickable ? " clickable" : ""),
        title: clickable ? "点击查看子代理思考内容" : (pill.childId ? undefined : "子代理未启动或已销毁"),
        style: { animation: "wft-arrive .3s cubic-bezier(.22,.61,.36,1) " + delay + "ms backwards" },
        onClick: clickable ? function () { try { onOpen(pill.childId); } catch (e) { console.warn("[workflow-timeline] openSession 失败:", String((e && e.message) || e)); } } : undefined
      },
        h(Face, { status: pill.status, seq: pill.seq }),
        h("span", { className: "wft-pill-name", style: pill.status === "running" || pill.status === "done" ? { opacity: 1 } : {} }, pill.label),
        h("span", { className: "wft-mark" + (pill.status === "failed" ? " failed" : "") }, StatusMark(pill.status))
      );
    }

    function MoreRow(props) {
      const more = props.more;
      const st = React.useState(false);
      const open = st[0], setOpen = st[1];
      const buckets = ATTENTION.map(function (s) { return { s: s, list: props.all.filter(function (p) { return p.status === s; }) }; }).filter(function (g) { return g.list.length > 0; });
      return h(React.Fragment, null,
        h("div", { className: "wft-more", onClick: function () { setOpen(!open); } },
          h("span", { className: "wft-deck" }, more.deck.map(function (p, i) {
            return h("span", { key: i, className: "wft-deck-face" }, h(Face, { status: p.status, seq: p.avatarIndex || p.seq }));
          })),
          h("span", { style: { flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, (open ? "折叠 " : "还有 ") + more.count + " 个"),
          more.failedHidden > 0 ? h("span", { style: { color: "#f85149", fontSize: 10 } }, "✕ " + more.failedHidden) : null,
          h("span", { style: { opacity: .4, fontSize: 11 } }, open ? "▾" : "▸")
        ),
        open ? h("div", { className: "wft-collapsed" },
          buckets.map(function (g) {
            return h("div", { key: g.s },
              h("div", { style: { fontSize: 9.5, opacity: .4, fontFamily: "Consolas,monospace", marginBottom: 3 } }, g.s + " ×" + g.list.length),
              g.list.map(function (p) {
                return h("div", { key: p.seq, className: "wft-collapsed-row" },
                  h("span", { className: "wft-mark" }, StatusMark(p.status)), p.label);
              })
            );
          })
        ) : null
      );
    }

    function RunCard(props) {
      const run = props.run, onOpen = props.onOpen, settings = props.settings, models = props.models, onDelete = props.onDelete;
      const rn = React.useState(false);
      const rnDraft = React.useState("");
      const commitRename = function () {
        const val = rnDraft[0].trim();
        rn[1](false);
        if (!val || val === run.name) return;
        fetch("api/workflow-timeline/rename", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ runId: run.id, name: val })
        }).catch(function () {});
      };
      const renameApi = [rn[0], rn[1], rnDraft[0], rnDraft[1], commitRename, function () { rn[1](false); }];
      const st = React.useState(true);
      const open = st[0], setOpen = st[1];
      const running = run.endedAt === 0;
      const failedCount = run.agents.filter(function (a) { return a.status === "failed"; }).length;
      const failed = failedCount > 0 || (run.stopReason && /error|fail|abort|cancel/i.test(run.stopReason));
      const dotColor = running ? "#e3a33a" : failed ? "#f85149" : "#3fb950";
      const groups = [];
      const byPhase = new Map();
      run.agents.forEach(function (a) {
        const key = a.phase === undefined || a.phase === null || a.phase === "" ? "（默认阶段）" : String(a.phase);
        if (!byPhase.has(key)) { byPhase.set(key, []); groups.push(key); }
        byPhase.get(key).push(a);
      });
      const time = new Date(run.startedAt).toLocaleTimeString();
      return h("div", { className: "wft-run" + (open ? " open" : "") },
        h("div", { className: "wft-run-head", onClick: function () { setOpen(!open); } },
          h("span", { className: "wft-dot", style: { background: dotColor } }),
          renameApi[0]
            ? h("input", {
                autoFocus: true,
                value: renameApi[2],
                onClick: function (e) { e.stopPropagation(); },
                onChange: function (e) { renameApi[3](e.target.value); },
                onKeyDown: function (e) { if (e.key === "Enter") renameApi[4](); if (e.key === "Escape") renameApi[5](); },
                onBlur: function () { renameApi[4](); },
                style: { flex: 1, minWidth: 0, background: "rgba(255,255,255,.08)", border: "1px solid #3C82F6", color: "inherit", borderRadius: 6, padding: "2px 8px", fontSize: 13, fontWeight: 600, outline: "none" }
              })
            : h("span", { className: "wft-run-name", title: "点击改名", onClick: function (e) { e.stopPropagation(); renameApi[3](run.displayName || run.name); renameApi[1](true); }, style: { cursor: "text" } }, run.displayName || run.name),
          h("button", {
            title: "删除此记录",
            onClick: function (e) {
              e.stopPropagation();
              if (confirm("删除这条运行记录？（含持久化存档）")) { try { onDelete && onDelete(run.id); } catch (err) {} }
            },
            style: { background: "transparent", border: "1px solid rgba(255,255,255,.15)", color: "rgba(255,255,255,.5)", borderRadius: 5, padding: "1px 7px", fontSize: 12, cursor: "pointer", flex: "0 0 auto" }
          }, "✕"),
          h("span", { className: "wft-run-meta" }, time + " · " + run.agents.length + " agents" + (failed ? " · 失败" : running ? "" : " · 完成"))
        ),
        h("div", { className: "wft-run-body" },
          h("div", { className: "wft-track" },
            groups.map(function (key, gi) {
              return h(Station, { key: "g" + gi, name: key, agents: byPhase.get(key), onOpen: onOpen, settings: props.settings, models: props.models, workflowName: run.name, metaPhases: run.metaPhases, overrides: props.overrides });
            })
          ),
          run.phases.length > 0 ? h("div", { className: "wft-foot" }, "phases: " + run.phases.map(function (p) { return p.title; }).join(" → ")) : null
        )
      );
    }

    /* 阶段配置：站点内嵌编辑器 */
    function useSettings() {
      const st = React.useState({ phases: [], ready: false });
      const s = st[0], setS = st[1];
      React.useEffect(function () {
        fetch("api/workflow-timeline/settings", { cache: "no-store" })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) { if (j && Array.isArray(j.phases)) setS({ phases: j.phases, ready: true }); else setS({ phases: [], ready: true }); })
          .catch(function () { setS({ phases: [], ready: true }); });
      }, []);
      const save = function (phase) {
        const phases = s.phases.filter(function (p) { return p.name !== phase.name; }).concat([phase]);
        setS({ phases: phases, ready: s.ready });
        return fetch("api/workflow-timeline/settings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ phases: phases })
        }).then(function (r) { return r.ok; }).catch(function () { return false; });
      };
      return { phases: s.phases, ready: s.ready, save: save };
    }

    /* ═══ phase 模型覆盖（workflow-overrides.json，真通：Router 下发时读它转 args.modelOverrides）═══ */
    function useOverrides() {
      const st = React.useState({ map: {}, ready: false });
      const s = st[0], setS = st[1];
      React.useEffect(function () {
        fetch("api/workflow-timeline/overrides", { cache: "no-store" })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) { setS({ map: j && j.overrides && typeof j.overrides === "object" ? j.overrides : {}, ready: true }); })
          .catch(function () { setS({ map: {}, ready: true }); });
      }, []);
      const save = function (workflowName, phaseTitle, provider, model) {
        return fetch("api/workflow-timeline/overrides", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workflowName: workflowName, phaseTitle: phaseTitle, provider: provider, model: model })
        }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
          if (j && j.ok && j.overrides) setS({ map: j.overrides, ready: true });
          return !!(j && j.ok);
        }).catch(function () { return false; });
      };
      return { map: s.map, ready: s.ready, save: save };
    }

    function Station(props) {
      const agents = props.agents, name = props.name, onOpen = props.onOpen, settings = props.settings, models = props.models || [];
      const workflowName = props.workflowName || "", metaPhases = Array.isArray(props.metaPhases) ? props.metaPhases : [];
      const overrides = props.overrides || { map: {}, save: function () { return Promise.resolve(false); } };
      // 覆盖 > meta.phases 声明 > 继承全局
      function overrideOf() {
        try { const wf = overrides.map ? overrides.map[workflowName] : undefined; return wf && wf[name] ? wf[name] : null; } catch (e) { return null; }
      }
      function declaredOf() {
        for (let i = 0; i < metaPhases.length; i++) { const p = metaPhases[i]; if (p && p.title === name) return p; }
        return null;
      }
      function valOf(entry) {
        if (!entry) return "";
        const p = entry.provider || "", m = entry.model || "";
        return p ? p + "/" + m : m;
      }
      function effectiveVal() { return valOf(overrideOf()) || valOf(declaredOf()) || ""; }
      const eds = React.useState({ editing: false, model: "", concurrency: 4, msg: "" });
      const ed = eds[0], setEd = eds[1];
      function deriveEditor() {
        const cfg0 = settings && settings.phases ? settings.phases.find(function (p) { return p.name === name; }) : undefined;
        return { editing: true, model: effectiveVal(), concurrency: cfg0 ? (cfg0.concurrency || 4) : 4, msg: "" };
      }
      const pills = agents.map(function (a) { return { seq: a.seq, label: a.label, status: a.status, childId: a.childId }; });
      const roster = rosterOf(pills);
      const failed = pills.filter(function (p) { return p.status === "failed"; }).length;
      const running = pills.filter(function (p) { return p.status === "running"; }).length;
      const done = pills.filter(function (p) { return p.status === "done"; }).length;
      const lamp = failed > 0 ? "failed" : running > 0 ? "running" : "done";
      const inpStyle = { background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", color: "inherit", borderRadius: 6, padding: "3px 7px", fontSize: 11, outline: "none" };
      function doSave() {
        const val = (ed.model || "").trim();
        const i = val.indexOf("/");
        const provider = i > 0 ? val.slice(0, i) : "";
        const model = i > 0 ? val.slice(i + 1) : val;
        const conc = Math.max(1, Math.min(16, Number(ed.concurrency) || 4));
        Promise.all([
          overrides.save(workflowName, name, provider, model),
          settings.save({ name: name, model: "", concurrency: conc })
        ]).then(function (rs) {
          const ok = rs[0] && rs[1];
          setEd(function (p) { return Object.assign({}, p, { msg: ok ? "已保存，下次下发生效" : "保存失败" }); });
        });
      }
      const ovNow = overrideOf(), declNow = declaredOf(), cfgShow = settings && settings.phases ? settings.phases.find(function (p) { return p.name === name; }) : undefined;
      const effVal = effectiveVal();
      const effSrc = ovNow ? "覆盖" : (declNow && valOf(declNow)) ? "声明" : "继承";
      const optionVals = {};
      models.forEach(function (m) { const v = m.provider ? m.provider + "/" + m.id : m.id; optionVals[v] = true; });
      const extraOption = effVal && !optionVals[effVal] ? [h("option", { key: "__eff", value: effVal }, effVal + "（当前生效值）")] : [];
      return h("div", { className: "wft-station" },
        h("div", { className: "wft-station-label" },
          h("span", { style: { width: 9, height: 9, borderRadius: "50%", flex: "0 0 auto", background: failed > 0 ? "#f85149" : running > 0 ? "#e3a33a" : "#3fb950" } }),
          h("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" } }, name),
          h("span", { className: "wft-station-cnt" }, done + "✓ " + running + "◌ " + (failed ? failed + "✗" : "")),
          h("button", {
            title: "配置该阶段（模型/并发）——模型保存写入覆盖文件，下次下发生效",
            onClick: function () { setEd(function (p) { return p.editing ? Object.assign({}, p, { editing: false }) : deriveEditor(); }); },
            style: { marginLeft: 6, background: "transparent", border: "1px solid rgba(255,255,255,.15)", color: "inherit", borderRadius: 5, padding: "0 6px", fontSize: 11, cursor: "pointer", opacity: .8, flex: "0 0 auto" }
          }, "⚙")
        ),
        h("div", { className: "wft-rail" },
          h("span", { className: "wft-lamp " + lamp }),
          h("span", { className: "wft-rail-line" })
        ),
        !ed.editing ? h("div", { title: "模型来源：覆盖 > meta.phases 声明 > 继承全局；并发为面板私有设置", style: { fontSize: 9.5, opacity: .55, fontFamily: "Consolas,monospace", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } },
          "▸" + effSrc + "：" + (effVal || "继承全局") + (cfgShow && cfgShow.concurrency ? " ×" + cfgShow.concurrency : "") + (ovNow ? " ✓" : "")) : null,
        ed.editing ? h("div", { className: "wft-editor", style: { display: "flex", flexDirection: "column", gap: 4, margin: "4px 0 6px", padding: 8, border: "1px solid rgba(255,255,255,.12)", borderRadius: 8, background: "rgba(255,255,255,.03)" } },
          models.length > 0
            ? h("select", {
                value: ed.model || "",
                onChange: function (e) { setEd(function (p) { return Object.assign({}, p, { model: e.target.value }); }); },
                style: Object.assign({}, inpStyle, { width: "100%", boxSizing: "border-box", cursor: "pointer", background: "#262626", color: "#e8e8e8" })
              },
                h("option", { value: "" }, "默认模型（继承全局）"),
                extraOption,
                models.map(function (m) {
                  const val = m.provider ? m.provider + "/" + m.id : m.id;
                  return h("option", { key: val, value: val }, m.name + (m.provider ? " · " + m.provider : ""));
                })
              )
            : h("div", null,
                h("input", { value: ed.model, placeholder: "模型（如 glm-5.3，留空=默认）", onChange: function (e) { setEd(function (p) { return Object.assign({}, p, { model: e.target.value }); }); }, style: Object.assign({}, inpStyle, { width: "100%", boxSizing: "border-box" }) }),
                h("div", { style: { fontSize: 9.5, opacity: .45, marginTop: 2 } }, "模型目录未加载——重启 DSH 后自动从你的 API 配置继承")
              ),
          h("div", { className: "wft-editor-row", style: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" } },
            h("input", { type: "number", min: 1, max: 16, value: ed.concurrency, onChange: function (e) { setEd(function (p) { return Object.assign({}, p, { concurrency: e.target.value }); }); }, style: Object.assign({}, inpStyle, { width: 56 }) }),
            h("button", { onClick: doSave, style: { background: "#3C82F6", border: "none", color: "#fff", borderRadius: 5, padding: "3px 10px", fontSize: 11, cursor: "pointer" } }, "保存"),
            h("span", { style: { fontSize: 9.5, opacity: .5 } }, ed.msg || (running > 0 ? "运行中·下次下发生效" : "下次下发生效"))
          )
        ) : null,
        roster.pills.map(function (p, i) { return h(Pill, { key: "p" + p.seq, pill: p, onOpen: onOpen, delay: i * 30 }); }),
        roster.more ? h(MoreRow, { key: "more", more: roster.more, all: pills }) : null
      );
    }

    function useModels(loadModels) {
      const st = React.useState([]);
      React.useEffect(function () {
        let stop = false;
        if (typeof loadModels !== "function") return;
        loadModels().then(function (rows) { if (!stop) st[1](rows || []); }).catch(function () {});
        return function () { stop = true; };
      }, []);
      return st[0];
    }

    function TimelinePanel(props) {
      const st = React.useState({ runs: [], now: 0, ok: false });
      const data = st[0], setData = st[1];
      const rootRef = React.useRef(null);
      const narrowSt = React.useState(false);
      const narrow = narrowSt[0], setNarrow = narrowSt[1];
      React.useEffect(function () {
        const el = rootRef.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(function (entries) {
          const w = entries[0] && entries[0].contentRect ? entries[0].contentRect.width : el.clientWidth;
          setNarrow(w < 640);
        });
        ro.observe(el);
        return function () { ro.disconnect(); };
      }, []);
      const settings = useSettings();
      const overrides = useOverrides();
      const models = useModels(props.loadModels);
      React.useEffect(function () {
        let stop = false;
        function tick() {
          fetch("api/workflow-timeline/runs", { cache: "no-store" })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (j) { if (!stop && j) setData({ runs: j.runs || [], now: j.now, ok: true }); })
            .catch(function () { if (!stop) setData(function (d) { return { runs: d.runs, now: d.now, ok: false }; }); });
        }
        tick();
        const timer = setInterval(tick, 2000);
        return function () { stop = true; clearInterval(timer); };
      }, []);
      const runs = data.runs || [];
      const anyRunning = runs.some(function (r) { return r.endedAt === 0; });
      const totalAgents = runs.reduce(function (n, r) { return n + r.agents.length; }, 0);
      let onOpen = undefined;
      try { onOpen = function (sessionId) { if (props && props.openSession) props.openSession(sessionId); }; } catch (e) {}
      const onDelete = function (runId) {
        fetch("api/workflow-timeline/delete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ runId: runId })
        }).catch(function () {});
      };
      const clearingSt = React.useState(false);
      const clearing = clearingSt[0], setClearing = clearingSt[1];
      const onDeleteAll = function () {
        if (clearing) return;
        const n = runs.length;
        if (!n) return;
        if (!confirm("删除全部 " + n + " 条运行记录？\n（含持久化存档，重启后也不会再出现；仍在运行的 workflow 会随新事件重新出现）")) return;
        setClearing(true);
        fetch("api/workflow-timeline/delete-all", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}"
        })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) {
            if (j && j.ok) setData(function (d) { return Object.assign({}, d, { runs: [] }); });
          })
          .catch(function () {})
          .then(function () { setClearing(false); });
      };
      return h("div", { ref: rootRef, className: "wft-panel" + (narrow ? " narrow" : "") },
        h("div", { className: "wft-head" },
          h("span", { className: "wft-live" + (anyRunning ? " running" : "") }),
          h("span", { className: "wft-title" }, "工作流时间线"),
          h("span", { className: "wft-sub" }, runs.length + " runs · " + totalAgents + " agents" + (data.ok ? "" : " · 离线")),
          h("span", { className: "wft-head-spacer" }),
          runs.length > 0 ? h("button", {
            className: "wft-clear",
            title: "批量删除：清空下方全部运行记录（含持久化存档）",
            disabled: clearing,
            onClick: onDeleteAll
          }, clearing ? "清空中…" : "🗑 清空全部") : null
        ),
        h("div", { className: "wft-scroll" },
          runs.length === 0
            ? h("div", { className: "wft-empty" }, "还没有工作流运行。\n让模型调用 workflow 工具（多代理编排）后，这里会出现横向时间线，每个阶段可点 ⚙ 配置模型与并发——模型保存写入覆盖文件，Router 下发时自动套用，下次下发生效。")
            : runs.slice().reverse().map(function (r) { return h(RunCard, { key: r.id, run: r, onOpen: onOpen, settings: settings, overrides: overrides, models: models, onDelete: onDelete }); })
        )
      );
    }

    function PanelIcon(a) {
      return h("svg", { viewBox: "0 0 16 16", width: a.size, height: a.size, fill: "none", stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
        h("circle", { cx: 3, cy: 8, r: 1.6 }),
        h("circle", { cx: 8, cy: 4, r: 1.6 }),
        h("circle", { cx: 13, cy: 4, r: 1.6 }),
        h("circle", { cx: 13, cy: 12, r: 1.6 }),
        h("path", { d: "M4.4 7.2 6.6 5M9.6 5l1.8 5M4.6 8.8l6 2.6" })
      );
    }

    const FULL_CSS = CSS + "\n@keyframes wft-arrive{from{opacity:0;transform:translateY(6px) scale(.97)}}";
    if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
      const st2 = document.createElement("style");
      st2.id = STYLE_ID;
      st2.textContent = FULL_CSS;
      document.head.appendChild(st2);
    }

    const inject = ["slots", "uiWorkspace", "remote", "remote.session", "connection", "sidebarRightTabs", "sidebarRight", "sessions"];
    function apply(ctx) {
      function safe(fn, tag) {
        return function () {
          try { return fn(); } catch (e) { console.warn("[workflow-timeline] " + tag + ":", String((e && e.message) || e)); return function () {}; }
        };
      }
      const slots = ctx.slots;
      if (!slots || typeof slots.inject !== "function") {
        console.warn("[workflow-timeline] slots 服务不可用，面板未注册");
        return;
      }
      const openSession = function (childId) {
        // 优先：右栏「子代理聊天」页签（不切主会话）；兜底：主会话打开
        let parent = undefined;
        try {
          const sessions = ctx.sessions;
          const snap = sessions && sessions.list && typeof sessions.list.getSnapshot === "function" ? sessions.list.getSnapshot() : undefined;
          const rec = snap && snap.byId ? snap.byId[childId] : undefined;
          parent = rec && (rec.parentSessionId || rec.parentId);
        } catch (e2) {}
        try {
          if (ctx.sidebarRight && typeof ctx.sidebarRight.openResource === "function" && parent) {
            const q = new URLSearchParams({ parent: String(parent), mode: "unknown" });
            ctx.sidebarRight.openResource("dsh-resource://subagentchat/session/" + encodeURIComponent(childId) + "?" + q.toString());
            console.log("[workflow-timeline] 子代理已在右栏打开 (parent=" + parent + ")");
            return;
          }
          console.warn("[workflow-timeline] 走主会话兜底: " + (!parent ? "快照无父会话记录(childId=" + childId.slice(0, 8) + "...)" : "sidebarRight.openResource 不可用"));
        } catch (e3) { console.warn("[workflow-timeline] 右栏打开子代理失败:", String((e3 && e3.message) || e3)); }
        try {
          if (ctx.uiWorkspace && typeof ctx.uiWorkspace.openSession === "function") {
            ctx.uiWorkspace.openSession(childId);
          } else {
            console.warn("[workflow-timeline] uiWorkspace.openSession 不可用");
          }
        } catch (e) {
          console.warn("[workflow-timeline] openSession 失败:", String((e && e.message) || e));
        }
      };
      // 模型目录：继承用户 API 配置（任务看板同款三级 fallback）
      async function loadModels() {
        let rows = [];
        // 路径1：remote.session.modelCatalog
        try {
          const remote = ctx.get ? ctx.get("remote") : undefined;
          const sessionRemote = remote && remote.session;
          if (sessionRemote && typeof sessionRemote.modelCatalog === "function") {
            const res = await sessionRemote.modelCatalog();
            if (res && res.ok && res.value) {
              const groups = (res.value && res.value.groups) || [];
              for (const g of groups) {
                const provider = g.id || g.provider || "";
                for (const m of (g.models || [])) {
                  if (m && m.id) rows.push({ provider: String(provider), id: String(m.id), name: String(m.name || m.id) });
                }
              }
              console.log("[workflow-timeline] 模型目录(路径1 remote.session): " + rows.length + " 个");
            }
          }
        } catch (e) { console.warn("[workflow-timeline] 路径1失败:", String((e && e.message) || e)); }
        // 路径2：connection.api.llm.discoverModels
        if (rows.length === 0) {
          try {
            const conn = ctx.get ? ctx.get("connection") : undefined;
            if (conn && conn.api && conn.api.llm && typeof conn.api.llm.discoverModels === "function") {
              const res = await conn.api.llm.discoverModels();
              const value = res && res.result && res.result.value ? res.result.value : res;
              const list = value && value.models ? value.models : (Array.isArray(value) ? value : []);
              for (const m of list) {
                if (m && m.id) rows.push({ provider: "", id: String(m.id), name: String(m.name || m.id) });
              }
              console.log("[workflow-timeline] 模型目录(路径2 llm.discoverModels): " + rows.length + " 个");
            }
          } catch (e) { console.warn("[workflow-timeline] 路径2失败:", String((e && e.message) || e)); }
        }
        // 路径3：connection.api.session(s).modelCatalog
        if (rows.length === 0) {
          try {
            const conn = ctx.get ? ctx.get("connection") : undefined;
            const api = conn && conn.api;
            const catalogFn = api && (typeof api.session?.modelCatalog === "function" ? api.session.modelCatalog : (typeof api.sessions?.modelCatalog === "function" ? api.sessions.modelCatalog : undefined));
            if (catalogFn) {
              const res = await catalogFn();
              const value = res && res.result && res.result.value ? res.result.value : res;
              const groups = value && value.groups ? value.groups : [];
              for (const g of groups) {
                const provider = g.id || g.provider || "";
                for (const m of (g.models || [])) {
                  if (m && m.id) rows.push({ provider: String(provider), id: String(m.id), name: String(m.name || m.id) });
                }
              }
              console.log("[workflow-timeline] 模型目录(路径3 session.modelCatalog): " + rows.length + " 个");
            }
          } catch (e) { console.warn("[workflow-timeline] 路径3失败:", String((e && e.message) || e)); }
        }
        if (rows.length === 0) console.warn("[workflow-timeline] 三条路径都没拿到模型目录");
        return rows;
      }

      try {
        slots.inject("sidebar.panellist", safe(function () {
          return slots.register({
            name: "sidebar.panellist",
            id: "workflow-timeline",
            order: 25,
            label: function () { return "工作流"; }
          }, PanelIcon);
        }, "sidebar 注册"));
        slots.inject("main", safe(function () {
          return slots.register({
            name: "main",
            key: "workflow-timeline",
            inject: function () { return { openSession: openSession, loadModels: loadModels }; }
          }, TimelinePanel);
        }, "main 注册"));

        // ═══ 右边栏：页签类型（guide 条目进「更多工具」菜单）+ 本体 + 标题 ═══
        function registerSidebarTab(attempt) {
          attempt = attempt || 0;
          try {
            if (ctx.sidebarRightTabs && typeof ctx.sidebarRightTabs.register === "function") {
              ctx.sidebarRightTabs.register({
                id: "workflow-timeline",
                kind: "workflow-timeline",
                title: function () { return "工作流时间线"; },
                guide: [{
                  id: "panel",
                  commandId: "workflow-timeline.panel",
                  order: 30,
                  title: function () { return "工作流时间线"; },
                  description: function () { return "多代理编排的横向时间线（阶段/模型/并发）"; },
                  icon: function () {
                    return h("svg", { viewBox: "0 0 16 16", width: 16, height: 16, fill: "none", stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
                      h("circle", { cx: 3, cy: 8, r: 1.6 }),
                      h("circle", { cx: 8, cy: 4, r: 1.6 }),
                      h("circle", { cx: 13, cy: 4, r: 1.6 }),
                      h("circle", { cx: 13, cy: 12, r: 1.6 }),
                      h("path", { d: "M4.4 7.2 6.6 5M9.6 5l1.8 5M4.6 8.8l6 2.6" }));
                  }
                }]
              });
              console.log("[workflow-timeline] 右栏页签类型已注册（含 guide 菜单条目）");
              return;
            }
          } catch (e3) { console.warn("[workflow-timeline] 右栏类型注册失败:", String((e3 && e3.message) || e3)); return; }
          if (attempt < 20) setTimeout(function () { registerSidebarTab(attempt + 1); }, 500);
          else console.warn("[workflow-timeline] sidebarRightTabs 始终不可用，右栏入口放弃");
        }
        registerSidebarTab();
        slots.inject("sidebar.right.pane.tab", safe(function () {
          return slots.register({
            name: "sidebar.right.pane.tab",
            key: "workflow-timeline",
            inject: function () { return { openSession: openSession, loadModels: loadModels }; }
          }, TimelinePanel);
        }, "右栏 body"));
        slots.inject("sidebar.right.pane.tab.title", safe(function () {
          return slots.register({
            name: "sidebar.right.pane.tab.title",
            key: "workflow-timeline"
          }, function () { return h("span", null, "工作流时间线"); });
        }, "右栏 title"));
        console.log("[workflow-timeline] v6 面板已注册（sidebar + main，phase 覆盖 + 清空全部）");
      } catch (error) {
        console.warn("[workflow-timeline] 注册失败:", String((error && error.message) || error));
      }
    }
    return { apply: apply, inject: inject };
  }
});
