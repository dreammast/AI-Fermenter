import { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

// ─── THRESHOLDS ───────────────────────────────────────────────────────────────
const DO_LOW  = 5.5;  const DO_HIGH  = 7.0;
const PH_LOW  = 6.5;  const PH_HIGH  = 7.5;
const DO_CRIT = 4.5;  const PH_CRIT_L = 5.8; const PH_CRIT_H = 8.2;

// ─── LOCAL ML FALLBACK (simulate mode) ───────────────────────────────────────
function localPredict(DO, pH, air, acid, base) {
  const do_drop = 0.08 + Math.random() * 0.06;
  const ph_drift = -0.04 + Math.random() * 0.04;
  const pred_do = Math.max(2, Math.min(9.5, DO - do_drop + (air  ? 0.20 + Math.random()*0.10 : 0) + (Math.random()-0.5)*0.04));
  const pred_ph = Math.max(5, Math.min(9,   pH + ph_drift + (base ? 0.14 + Math.random()*0.08 : 0) - (acid ? 0.14 + Math.random()*0.08 : 0) + (Math.random()-0.5)*0.03));
  let alarm = 0;
  if (pred_do < DO_CRIT || pred_ph < PH_CRIT_L || pred_ph > PH_CRIT_H) alarm = 2;
  else if (pred_do < DO_LOW || pred_ph < PH_LOW || pred_ph > PH_HIGH)   alarm = 1;
  return { pred_do: +pred_do.toFixed(3), pred_ph: +pred_ph.toFixed(3), alarm };
}

function simulateSensor(prev, pumps) {
  const DO = Math.max(2, Math.min(9.5, prev.DO - 0.08 - Math.random()*0.06
    + (pumps.air  ? 0.20 + Math.random()*0.10 : 0) + (Math.random()-0.5)*0.05));
  const pH = Math.max(5, Math.min(9,   prev.pH - 0.04 - Math.random()*0.03
    + (pumps.base ? 0.15 + Math.random()*0.08 : 0)
    - (pumps.acid ? 0.15 + Math.random()*0.08 : 0) + (Math.random()-0.5)*0.03));
  return { DO: +DO.toFixed(3), pH: +pH.toFixed(3) };
}

function ruleControl(DO, pH) {
  return { air: DO < DO_LOW, base: pH < PH_LOW, acid: pH > PH_HIGH };
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const ALARM = {
  0: { label:"NORMAL",   color:"#00e5a0", bg:"rgba(0,229,160,0.10)" },
  1: { label:"WARNING",  color:"#ffb347", bg:"rgba(255,179,71,0.12)" },
  2: { label:"CRITICAL", color:"#ff4e6a", bg:"rgba(255,78,106,0.12)" },
};
const ts = () => new Date().toLocaleTimeString("en-GB");

// ─── GAUGE ────────────────────────────────────────────────────────────────────
function Gauge({ value, min, max, low, high, color, unit, label }) {
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const R = 50; const CX = 65; const CY = 70;
  const pt = (deg) => {
    const r = ((deg) * Math.PI) / 180;
    return { x: CX + R * Math.cos(r), y: CY + R * Math.sin(r) };
  };
  const s = pt(-135); const e = pt(135);
  const needle = pt(-135 + pct * 270);
  const lpct = Math.max(0, Math.min(1, (low  - min)/(max - min)));
  const hpct = Math.max(0, Math.min(1, (high - min)/(max - min)));
  const sl = pt(-135 + lpct * 270); const sh = pt(-135 + hpct * 270);
  const la = (hpct - lpct) * 270 > 180 ? 1 : 0;

  return (
    <svg width={150} height={120} viewBox="0 0 130 110" style={{ overflow:"visible" }}>
      <path d={`M${s.x} ${s.y} A${R} ${R} 0 1 1 ${e.x} ${e.y}`} fill="none" stroke="#111d2e" strokeWidth="10" strokeLinecap="round"/>
      <path d={`M${sl.x} ${sl.y} A${R} ${R} 0 ${la} 1 ${sh.x} ${sh.y}`} fill="none" stroke={color+"18"} strokeWidth="10"/>
      <path d={`M${s.x} ${s.y} A${R} ${R} 0 ${pct>0.5?1:0} 1 ${needle.x} ${needle.y}`} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" style={{filter:`drop-shadow(0 0 6px ${color}88)`}}/>
      <circle cx={needle.x} cy={needle.y} r="5" fill={color} style={{filter:`drop-shadow(0 0 8px ${color})`}}/>
      <text x="65" y="68" textAnchor="middle" fill="#eaf6ff" fontSize="19" fontWeight="700" fontFamily="'Space Mono',monospace">{value}</text>
      <text x="65" y="80" textAnchor="middle" fill="#4a6a80" fontSize="8">{unit}</text>
      <text x="65" y="96" textAnchor="middle" fill="#4a6a80" fontSize="7.5">{label}</text>
    </svg>
  );
}

// ─── PUMP CARD ────────────────────────────────────────────────────────────────
function PumpCard({ icon, name, desc, active, color }) {
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:"10px",
      background: active ? `${color}12` : "#060e1a",
      border:`1px solid ${active ? color : "#0d2035"}`,
      borderRadius:"8px", padding:"11px 14px",
      transition:"all 0.4s",
      boxShadow: active ? `0 0 14px ${color}28` : "none",
    }}>
      <span style={{fontSize:"18px"}}>{icon}</span>
      <div style={{flex:1}}>
        <div style={{fontSize:"11px", color: active ? color : "#4a6a80", letterSpacing:"1px", fontWeight:"700"}}>{name}</div>
        <div style={{fontSize:"9px", color:"#2a4a60", marginTop:"2px"}}>{desc}</div>
      </div>
      <div style={{
        fontSize:"12px", fontWeight:"700", letterSpacing:"1px",
        color: active ? color : "#1e3a50",
        textShadow: active ? `0 0 8px ${color}` : "none",
      }}>{active ? "ON" : "OFF"}</div>
    </div>
  );
}

// ─── MODE BUTTON ─────────────────────────────────────────────────────────────
function ModeBtn({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding:"6px 13px", borderRadius:"5px", fontSize:"9px", letterSpacing:"1.5px",
      cursor:"pointer", fontFamily:"inherit", fontWeight:"700",
      background: active ? "#0a3060" : "transparent",
      border: active ? "1px solid #0055aa" : "1px solid #0d2035",
      color: active ? "#00b4ff" : "#3a5a70",
      transition:"all 0.2s",
    }}>{label}</button>
  );
}

// ─── STATUS PILL ─────────────────────────────────────────────────────────────
function StatusPill({ connected, label }) {
  const c = connected ? "#00e5a0" : "#ff4e6a";
  return (
    <div style={{display:"flex", alignItems:"center", gap:"5px", fontSize:"9px", color:c, letterSpacing:"1px"}}>
      <div style={{width:"6px",height:"6px",borderRadius:"50%",background:c, boxShadow:`0 0 6px ${c}`}}/>
      {label}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export default function FermenterDashboard() {
  const TICK   = 2500;
  const MAX_H  = 60;

  const [mode,    setMode]    = useState("simulate");   // simulate | api | esp32 | live
  const [apiUrl,  setApiUrl]  = useState("http://localhost:5000");
  const [esp32Url,setEsp32Url]= useState("http://192.168.1.100/data");
  const [running, setRunning] = useState(true);
  const [conn,    setConn]    = useState(true);

  const [sensor,  setSensor]  = useState({ DO: 6.2, pH: 7.0 });
  const [pumps,   setPumps]   = useState({ air:false, base:false, acid:false });
  const [pred,    setPred]    = useState({ pred_do:6.1, pred_ph:6.98, alarm:0, alarm_text:"NORMAL", alarm_color:"#00e5a0" });
  const [history, setHistory] = useState([]);
  const [log,     setLog]     = useState([]);
  const [tick,    setTick]    = useState(0);
  const [apiInfo, setApiInfo] = useState(null);
  
  const lastCloudTsRef = useRef(null);

  const prevRef = useRef({ DO: 6.2, pH: 7.0 });

  const addLog = useCallback((msg, type="info") => {
    setLog(l => [{ t: ts(), msg, type }, ...l].slice(0, 40));
  }, []);

  // ── Check API status on connect ───────────────────────────────────────────
  const checkApi = useCallback(async () => {
    try {
      const r = await fetch(`${apiUrl}/status`);
      const j = await r.json();
      setApiInfo(j);
      setConn(true);
      addLog("✅ Connected to Python ML API", "success");
    } catch {
      setConn(false);
      addLog("❌ Cannot reach Python API at " + apiUrl, "error");
    }
  }, [apiUrl, addLog]);

  useEffect(() => { if (mode === "api") checkApi(); }, [mode, checkApi]);

  // ── Main tick ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!running) return;
    const id = setInterval(async () => {
      let newSensor, newPred, newPumps;

      // ── SIMULATE MODE ──────────────────────────────────────────────────────
      if (mode === "simulate") {
        newPumps  = ruleControl(prevRef.current.DO, prevRef.current.pH);
        newSensor = simulateSensor(prevRef.current, newPumps);
        newPred   = localPredict(newSensor.DO, newSensor.pH, newPumps.air?1:0, newPumps.acid?1:0, newPumps.base?1:0);
        newPred   = { ...newPred, alarm_text: ALARM[newPred.alarm].label, alarm_color: ALARM[newPred.alarm].color };
        setConn(true);

      // ── PYTHON API MODE ────────────────────────────────────────────────────
      } else if (mode === "api") {
        try {
          // Step 1: get simulated sensor reading from /simulate
          const simRes  = await fetch(`${apiUrl}/simulate`);
          const simData = await simRes.json();
          newSensor = { DO: simData.DO, pH: simData.pH };

          // Step 2: send to /predict and get REAL ML model output
          const predRes = await fetch(`${apiUrl}/predict`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              DO: newSensor.DO, pH: newSensor.pH,
              air_pump:  newSensor.DO < DO_LOW  ? 1 : 0,
              acid_pump: newSensor.pH > PH_HIGH ? 1 : 0,
              base_pump: newSensor.pH < PH_LOW  ? 1 : 0,
            })
          });
          const predData = await predRes.json();

          newPred = {
            pred_do:    predData.predicted_DO,
            pred_ph:    predData.predicted_pH,
            alarm:      predData.alarm_label,
            alarm_text: predData.alarm_text,
            alarm_color:predData.alarm_color,
          };
          newPumps = {
            air:  predData.auto_control.air_pump,
            base: predData.auto_control.base_pump,
            acid: predData.auto_control.acid_pump,
          };
          setConn(true);
          addLog(`API → DO=${newSensor.DO} pH=${newSensor.pH} | pred_DO=${newPred.pred_do} | ${newPred.alarm_text}`,
                 newPred.alarm === 2 ? "critical" : newPred.alarm === 1 ? "warning" : "info");

        } catch (err) {
          setConn(false);
          addLog("❌ API error: " + err.message, "error");
          return;
        }

      // ── ESP32 HTTP MODE ────────────────────────────────────────────────────
      } else if (mode === "esp32") {
        try {
          const r = await fetch(esp32Url);
          const d = await r.json();
          newSensor = { DO: +parseFloat(d.DO).toFixed(3), pH: +parseFloat(d.pH).toFixed(3) };
          newPumps  = ruleControl(newSensor.DO, newSensor.pH);
          newPred   = localPredict(newSensor.DO, newSensor.pH, newPumps.air?1:0, newPumps.acid?1:0, newPumps.base?1:0);
          newPred   = { ...newPred, alarm_text: ALARM[newPred.alarm].label, alarm_color: ALARM[newPred.alarm].color };
          setConn(true);
          addLog(`ESP32 → DO=${newSensor.DO}, pH=${newSensor.pH}`, "info");
        } catch (err) {
          setConn(false);
          addLog("❌ ESP32 fetch failed: " + err.message, "error");
          return;
        }
      // ── LIVE CLOUD MODE (ESP32) ───────────────────────────────────────────
      } else if (mode === "live") {
        try {
          const r = await fetch(`${apiUrl}/history?n=1`);
          const hist = await r.json();
          if (!hist || hist.length === 0) {
             setConn(false);
             return; 
          }
          const last = hist[0];
          newSensor = { DO: last.input.DO, pH: last.input.pH };
          newPred = { 
            pred_do: last.predicted_DO, 
            pred_ph: last.predicted_pH, 
            alarm: last.alarm_label, 
            alarm_text: last.alarm_text, 
            alarm_color: last.alarm_color 
          };
          newPumps = { 
            air: last.auto_control.air_pump, 
            base: last.auto_control.base_pump, 
            acid: last.auto_control.acid_pump 
          };
          setConn(true);
          
          if (lastCloudTsRef.current !== last.timestamp) {
            addLog(`Cloud → DO=${newSensor.DO} pH=${newSensor.pH} | AI_DO=${newPred.pred_do} | ${newPred.alarm_text}`, 
              newPred.alarm === 2 ? "critical" : newPred.alarm === 1 ? "warning" : "info");
            lastCloudTsRef.current = last.timestamp;
          }
        } catch (err) {
          setConn(false);
          addLog("❌ Cloud fetch failed: " + err.message, "error");
          return;
        }
      }

      prevRef.current = newSensor;
      setSensor(newSensor);
      setPumps(newPumps);
      setPred(newPred);
      setHistory(h => [...h, { t: ts(), DO: newSensor.DO, pH: newSensor.pH, pred_do: newPred.pred_do, pred_ph: newPred.pred_ph }].slice(-MAX_H));
      if (newPred.alarm === 2) addLog(`🔴 CRITICAL — pred DO=${newPred.pred_do}, pH=${newPred.pred_ph}`, "critical");
      else if (newPred.alarm === 1 && mode === "simulate") addLog(`🟡 WARNING — pred DO=${newPred.pred_do}`, "warning");
      setTick(t => t + 1);

    }, TICK);
    return () => clearInterval(id);
  }, [running, mode, apiUrl, esp32Url, addLog]);

  const alarm = ALARM[pred.alarm] || ALARM[0];

  return (
    <div style={{ minHeight:"100vh", background:"#060e1a", fontFamily:"'Space Mono','Courier New',monospace", color:"#eaf6ff",
      backgroundImage:"radial-gradient(ellipse at 15% 10%,#0a1f3518 0%,transparent 55%),radial-gradient(ellipse at 85% 90%,#0a2a1518 0%,transparent 55%)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');
        ::-webkit-scrollbar{width:4px;background:#04090f} ::-webkit-scrollbar-thumb{background:#0d2035;border-radius:4px}
        * { box-sizing: border-box; }
      `}</style>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"16px 24px", borderBottom:"1px solid #0d2035", background:"#03070e" }}>
        <div>
          <div style={{ fontSize:"10px", color:"#2a5070", letterSpacing:"3px", marginBottom:"3px" }}>IOT2526486 · IIOT FERMENTER MONITOR</div>
          <div style={{ fontSize:"16px", fontWeight:"700" }}>DO &amp; pH Control · ML Prediction Dashboard</div>
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:"14px" }}>
          {/* Alarm badge */}
          <div style={{ display:"flex", alignItems:"center", gap:"6px", background:alarm.bg,
            border:`1px solid ${alarm.color}44`, borderRadius:"6px", padding:"5px 13px",
            fontSize:"11px", color:alarm.color, letterSpacing:"1.5px", fontWeight:"700" }}>
            <div style={{ width:"8px", height:"8px", borderRadius:"50%", background:alarm.color,
              boxShadow: pred.alarm>0 ? `0 0 0 3px ${alarm.color}44` : "none",
              animation: pred.alarm>0 ? "none" : "none" }}/>
            {alarm.label}
          </div>

          {/* Connection status */}
          <StatusPill connected={conn} label={mode==="simulate"?"SIMULATION":conn?"CONNECTED":"DISCONNECTED"} />

          {/* Mode selector */}
          <div style={{ display:"flex", gap:"4px", background:"#03070e", padding:"4px", borderRadius:"8px", border:"1px solid #0d2035" }}>
            <ModeBtn label="SIMULATE"   active={mode==="simulate"} onClick={()=>setMode("simulate")} />
            <ModeBtn label="PYTHON API" active={mode==="api"}      onClick={()=>setMode("api")} />
            <ModeBtn label="ESP32 HTTP" active={mode==="esp32"}    onClick={()=>setMode("esp32")} />
            <ModeBtn label="LIVE CLOUD (ESP32)" active={mode==="live"} onClick={()=>setMode("live")} />
          </div>

          <button onClick={()=>setRunning(r=>!r)} style={{
            padding:"7px 18px", borderRadius:"6px", fontSize:"10px", letterSpacing:"1px",
            background: running?"#1a0a10":"#0a1f10", cursor:"pointer", fontFamily:"inherit",
            border: running?"1px solid #ff4e6a55":"1px solid #00e5a055",
            color: running?"#ff4e6a":"#00e5a0",
          }}>{running?"⏸ PAUSE":"▶ RUN"}</button>
        </div>
      </div>

      {/* ── CONFIG BAR ─────────────────────────────────────────────────────── */}
      {(mode === "api" || mode === "esp32" || mode === "live") && (
        <div style={{ background:"#03070e", padding:"10px 24px", borderBottom:"1px solid #0d2035",
          display:"flex", alignItems:"center", gap:"12px" }}>
          {(mode === "api" || mode === "live") && (<>
            <span style={{ color:"#2a5070", fontSize:"10px", letterSpacing:"2px", whiteSpace:"nowrap" }}>PYTHON API</span>
            <input value={apiUrl} onChange={e=>setApiUrl(e.target.value)}
              style={{ flex:1, background:"#060e1a", border:"1px solid #0d2035", borderRadius:"6px",
                padding:"6px 10px", color:"#00b4ff", fontSize:"11px", fontFamily:"inherit", outline:"none" }}/>
            <button onClick={checkApi} style={{ padding:"6px 14px", borderRadius:"5px", fontSize:"10px",
              background:"#0a2040", border:"1px solid #0055aa", color:"#00b4ff", cursor:"pointer", fontFamily:"inherit", letterSpacing:"1px" }}>
              TEST
            </button>
            <span style={{ color:"#2a5070", fontSize:"9px" }}>{mode === "api" ? "Runs your real model_DO.pkl · model_pH.pkl · model_alarm.pkl" : "Fetches the latest prediction pushed by ESP32"}</span>
          </>)}
          {mode === "esp32" && (<>
            <span style={{ color:"#2a5070", fontSize:"10px", letterSpacing:"2px", whiteSpace:"nowrap" }}>ESP32 URL</span>
            <input value={esp32Url} onChange={e=>setEsp32Url(e.target.value)}
              style={{ flex:1, background:"#060e1a", border:"1px solid #0d2035", borderRadius:"6px",
                padding:"6px 10px", color:"#00b4ff", fontSize:"11px", fontFamily:"inherit", outline:"none" }}/>
            <span style={{ color:"#2a5070", fontSize:"9px" }}>ESP32 must return: {`{"DO":5.8,"pH":6.9}`}</span>
          </>)}
        </div>
      )}

      {/* ── MAIN CONTENT ───────────────────────────────────────────────────── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"14px", padding:"18px 20px" }}>

        {/* Card 1: Gauges */}
        <div style={{ background:"#070d1a", border:"1px solid #0d2035", borderRadius:"12px", padding:"18px" }}>
          <div style={{ fontSize:"9px", color:"#2a5070", letterSpacing:"2.5px", marginBottom:"12px" }}>LIVE SENSOR READINGS</div>
          <div style={{ display:"flex", justifyContent:"space-around" }}>
            <div style={{ textAlign:"center" }}>
              <Gauge value={sensor.DO} min={2} max={9.5} low={DO_LOW} high={DO_HIGH}
                color={sensor.DO < DO_LOW ? "#ff4e6a" : "#00b4ff"} unit="mg/L" label="DISSOLVED O₂" />
              <div style={{ fontSize:"9px", color:"#2a5070", marginTop:"4px" }}>Range {DO_LOW}–{DO_HIGH}</div>
            </div>
            <div style={{ textAlign:"center" }}>
              <Gauge value={sensor.pH} min={5} max={9} low={PH_LOW} high={PH_HIGH}
                color={sensor.pH < PH_LOW ? "#ff4e6a" : sensor.pH > PH_HIGH ? "#ffb347" : "#e879f9"} unit="pH" label="ACIDITY" />
              <div style={{ fontSize:"9px", color:"#2a5070", marginTop:"4px" }}>Range {PH_LOW}–{PH_HIGH}</div>
            </div>
          </div>
          <div style={{ marginTop:"12px", padding:"8px", background:"#03070e", borderRadius:"6px",
            fontSize:"9px", color:"#2a5070", textAlign:"center", letterSpacing:"1px" }}>
            TICK #{tick} · {ts()}
          </div>
        </div>

        {/* Card 2: ML Prediction */}
        <div style={{ background:"#070d1a", border:`1px solid ${alarm.color}33`, borderRadius:"12px", padding:"18px",
          boxShadow:`0 0 24px ${alarm.color}10` }}>
          <div style={{ fontSize:"9px", color:"#2a5070", letterSpacing:"2.5px", marginBottom:"12px" }}>
            ML PREDICTION — NEXT 5 MIN
            {mode==="api" && <span style={{ color:"#00b4ff", marginLeft:"8px" }}>● REAL MODEL</span>}
          </div>
          <div style={{ display:"flex", gap:"10px", marginBottom:"12px" }}>
            <div style={{ flex:1, background:"#03070e", borderRadius:"8px", padding:"14px", textAlign:"center" }}>
              <div style={{ fontSize:"9px", color:"#2a5070", letterSpacing:"2px", marginBottom:"6px" }}>PREDICTED DO</div>
              <div style={{ fontSize:"34px", fontWeight:"700", lineHeight:1, color: pred.pred_do < DO_LOW ? "#ff4e6a" : "#00e5a0" }}>
                {pred.pred_do}
              </div>
              <div style={{ fontSize:"10px", color:"#2a5070", marginTop:"4px" }}>mg/L</div>
            </div>
            <div style={{ flex:1, background:"#03070e", borderRadius:"8px", padding:"14px", textAlign:"center" }}>
              <div style={{ fontSize:"9px", color:"#2a5070", letterSpacing:"2px", marginBottom:"6px" }}>PREDICTED pH</div>
              <div style={{ fontSize:"34px", fontWeight:"700", lineHeight:1,
                color: pred.pred_ph < PH_LOW ? "#ff4e6a" : pred.pred_ph > PH_HIGH ? "#ffb347" : "#00b4ff" }}>
                {pred.pred_ph}
              </div>
              <div style={{ fontSize:"10px", color:"#2a5070", marginTop:"4px" }}>pH units</div>
            </div>
          </div>
          <div style={{ background:alarm.bg, border:`1px solid ${alarm.color}33`, borderRadius:"8px",
            padding:"14px", textAlign:"center" }}>
            <div style={{ fontSize:"9px", color:"#2a5070", letterSpacing:"2px", marginBottom:"4px" }}>ALARM STATE</div>
            <div style={{ fontSize:"22px", fontWeight:"700", color:alarm.color, letterSpacing:"2px",
              textShadow:`0 0 20px ${alarm.color}66` }}>{alarm.label}</div>
            <div style={{ fontSize:"9px", color:"#2a5070", marginTop:"4px" }}>Advisory · No direct pump control</div>
          </div>
        </div>

        {/* Card 3: Pumps */}
        <div style={{ background:"#070d1a", border:"1px solid #0d2035", borderRadius:"12px", padding:"18px" }}>
          <div style={{ fontSize:"9px", color:"#2a5070", letterSpacing:"2.5px", marginBottom:"12px" }}>AUTOMATIC CONTROL (RULE-BASED)</div>
          <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
            <PumpCard icon="💨" name="AIR PUMP"  active={pumps.air}  color="#00b4ff"
              desc={`DO control · fires when DO < ${DO_LOW} mg/L`} />
            <PumpCard icon="🧪" name="BASE PUMP" active={pumps.base} color="#00e5a0"
              desc={`pH up · fires when pH < ${PH_LOW}`} />
            <PumpCard icon="⚗️" name="ACID PUMP" active={pumps.acid} color="#ffb347"
              desc={`pH down · fires when pH > ${PH_HIGH}`} />
          </div>

          {/* API info box */}
          {mode==="api" && apiInfo && (
            <div style={{ marginTop:"12px", background:"#03070e", borderRadius:"6px", padding:"10px",
              border:"1px solid #0055aa44", fontSize:"9px", color:"#2a5070", lineHeight:"1.8" }}>
              <div style={{ color:"#00b4ff", marginBottom:"4px" }}>● Python API Connected</div>
              <div>Models: {apiInfo.models?.join(" · ")}</div>
              <div>Version: {apiInfo.version}</div>
            </div>
          )}
        </div>

        {/* Card 4: DO Chart */}
        <div style={{ background:"#070d1a", border:"1px solid #0d2035", borderRadius:"12px", padding:"18px", gridColumn:"span 2" }}>
          <div style={{ fontSize:"9px", color:"#2a5070", letterSpacing:"2.5px", marginBottom:"10px" }}>
            DISSOLVED OXYGEN — ACTUAL (—) vs PREDICTED (- -) &nbsp;
            <span style={{ color:"#00b4ff" }}>■</span> Actual &nbsp;
            <span style={{ color:"#ff4e6a" }}>■</span> Predicted
          </div>
          <ResponsiveContainer width="100%" height={155}>
            <LineChart data={history} margin={{ top:5, right:8, left:-25, bottom:0 }}>
              <CartesianGrid stroke="#0d2035" strokeDasharray="3 3" />
              <XAxis dataKey="t" tick={{ fill:"#2a5070", fontSize:8 }} interval="preserveStartEnd" />
              <YAxis domain={[4,8]} tick={{ fill:"#2a5070", fontSize:8 }} />
              <Tooltip contentStyle={{ background:"#060e1a", border:"1px solid #0d2035", borderRadius:"6px", fontSize:"10px" }} />
              <ReferenceLine y={DO_LOW}  stroke="#ff4e6a" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value:`${DO_LOW}`, fill:"#ff4e6a", fontSize:8, position:"insideTopLeft" }}/>
              <ReferenceLine y={DO_HIGH} stroke="#00e5a0" strokeDasharray="4 4" strokeOpacity={0.3} />
              <Line type="monotone" dataKey="DO"      stroke="#00b4ff" strokeWidth={2} dot={false} name="Actual DO" />
              <Line type="monotone" dataKey="pred_do" stroke="#ff4e6a" strokeWidth={1.5} strokeDasharray="5 3" dot={false} name="Predicted DO" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Card 5: Event Log */}
        <div style={{ background:"#070d1a", border:"1px solid #0d2035", borderRadius:"12px", padding:"18px" }}>
          <div style={{ fontSize:"9px", color:"#2a5070", letterSpacing:"2.5px", marginBottom:"10px" }}>SYSTEM EVENT LOG</div>
          <div style={{ maxHeight:"185px", overflowY:"auto" }}>
            {log.length===0 && <div style={{ color:"#1e3a55", fontSize:"10px" }}>Waiting for events...</div>}
            {log.map((e,i) => (
              <div key={i} style={{ display:"flex", gap:"8px", padding:"4px 0",
                borderBottom:"1px solid #080f1c", fontSize:"9.5px",
                color: e.type==="critical"?"#ff4e6a": e.type==="warning"?"#ffb347": e.type==="success"?"#00e5a0":"#2a5070" }}>
                <span style={{ color:"#1a3050", flexShrink:0 }}>{e.t}</span>
                <span style={{ wordBreak:"break-word" }}>{e.msg}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Card 6: pH Chart */}
        <div style={{ background:"#070d1a", border:"1px solid #0d2035", borderRadius:"12px", padding:"18px", gridColumn:"span 2" }}>
          <div style={{ fontSize:"9px", color:"#2a5070", letterSpacing:"2.5px", marginBottom:"10px" }}>
            pH LEVEL — ACTUAL (—) vs PREDICTED (- -) &nbsp;
            <span style={{ color:"#e879f9" }}>■</span> Actual &nbsp;
            <span style={{ color:"#ffb347" }}>■</span> Predicted
          </div>
          <ResponsiveContainer width="100%" height={155}>
            <LineChart data={history} margin={{ top:5, right:8, left:-25, bottom:0 }}>
              <CartesianGrid stroke="#0d2035" strokeDasharray="3 3" />
              <XAxis dataKey="t" tick={{ fill:"#2a5070", fontSize:8 }} interval="preserveStartEnd" />
              <YAxis domain={[5.5,8.5]} tick={{ fill:"#2a5070", fontSize:8 }} />
              <Tooltip contentStyle={{ background:"#060e1a", border:"1px solid #0d2035", borderRadius:"6px", fontSize:"10px" }} />
              <ReferenceLine y={PH_LOW}  stroke="#ff4e6a" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value:`${PH_LOW}`, fill:"#ff4e6a", fontSize:8, position:"insideTopLeft" }}/>
              <ReferenceLine y={PH_HIGH} stroke="#ffb347" strokeDasharray="4 4" strokeOpacity={0.5} />
              <Line type="monotone" dataKey="pH"      stroke="#e879f9" strokeWidth={2} dot={false} name="Actual pH" />
              <Line type="monotone" dataKey="pred_ph" stroke="#ffb347" strokeWidth={1.5} strokeDasharray="5 3" dot={false} name="Predicted pH" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Card 7: Connection Guide */}
        <div style={{ background:"#070d1a", border:"1px solid #0d2035", borderRadius:"12px", padding:"18px" }}>
          <div style={{ fontSize:"9px", color:"#2a5070", letterSpacing:"2.5px", marginBottom:"12px" }}>SETUP GUIDE</div>
          <div style={{ fontSize:"9.5px", lineHeight:"1.9", color:"#3a6080" }}>

            {mode==="simulate" && <>
              <div style={{ color:"#00e5a0", marginBottom:"6px", fontSize:"10px" }}>▸ Running in Simulation Mode</div>
              <div>Sensor data is generated locally</div>
              <div>ML prediction uses built-in logic</div>
              <div style={{ marginTop:"8px", color:"#2a5070" }}>Switch to PYTHON API to use your</div>
              <div style={{ color:"#2a5070" }}>real trained .pkl models</div>
            </>}

            {mode==="api" && <>
              <div style={{ color:"#00b4ff", marginBottom:"6px", fontSize:"10px" }}>▸ Python API Mode</div>
              <div>1. pip install flask flask-cors joblib</div>
              <div>2. Copy models to api_server.py folder</div>
              <div>3. python api_server.py</div>
              <div>4. Set URL → http://localhost:5000</div>
              <div>5. Press TEST button above</div>
              <div style={{ marginTop:"8px", background:"#03070e", padding:"7px", borderRadius:"5px", color:"#00e5a0" }}>
                GET /simulate → sensor data{"\n"}POST /predict → ML output
              </div>
            </>}

            {mode==="esp32" && <>
              <div style={{ color:"#ffb347", marginBottom:"6px", fontSize:"10px" }}>▸ ESP32 HTTP Mode</div>
              <div>1. Upload firmware to ESP32</div>
              <div>2. Connect to same Wi-Fi</div>
              <div>3. ESP32 returns JSON:</div>
              <div style={{ background:"#03070e", padding:"7px", borderRadius:"5px", color:"#00e5a0", margin:"6px 0" }}>
                {`{"DO": 5.8, "pH": 6.9}`}
              </div>
              <div>4. Add CORS header to firmware</div>
              <div>5. Enter IP URL above</div>
            </>}

            {mode==="live" && <>
              <div style={{ color:"#00e5a0", marginBottom:"6px", fontSize:"10px" }}>▸ Live Cloud Mode</div>
              <div>1. Connect your ESP32 to Wi-Fi</div>
              <div>2. The ESP32 POSTs to the Python API</div>
              <div>3. The Dashboard automatically fetches the latest data</div>
              <div style={{ background:"#03070e", padding:"7px", borderRadius:"5px", color:"#00e5a0", margin:"6px 0" }}>
                GET /history?n=1
              </div>
            </>}

          </div>
        </div>

      </div>
    </div>
  );
}
