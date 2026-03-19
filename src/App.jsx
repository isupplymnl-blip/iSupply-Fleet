import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import LoginScreen from './LoginScreen';
import TripleWhaleCard from './TripleWhaleCard';
import { WORKSPACE_CONFIG } from './config';
import { 
  Loader2, ServerCrash, Activity, Bot, TerminalSquare, 
  DatabaseZap, Play, Square, RefreshCw, Calendar, Send, Sparkles, Cpu, Download 
} from 'lucide-react';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentWorkspace, setCurrentWorkspace] = useState('');
  const [supabase, setSupabase] = useState(null);
  const [geminiKey, setGeminiKey] = useState('');
  
  // App State
  const [activeTab, setActiveTab] = useState('analytics');
  const [orders, setOrders] = useState([]);
  const [cloudLogs, setCloudLogs] = useState([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dbError, setDbError] = useState(null);
  
  // Filters & VPS State
  const [dateFilter, setDateFilter] = useState('Last 30 Days');
  const [vpsStatus, setVpsStatus] = useState('UNKNOWN');
  const [isToggling, setIsToggling] = useState(false);
  const [isUpdatingCode, setIsUpdatingCode] = useState(false);

  // AI State
  const [lighthouseText, setLighthouseText] = useState("Click 'Generate Forecast' to trigger Gemini's analysis of your logistics pipeline...");
  const [isLighthouseLoading, setIsLighthouseLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState([
    { role: 'ai', text: "🤖 iSupply System Oracle Online. Ask me about your current operations, pipeline, or database metrics." }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isOracleThinking, setIsOracleThinking] = useState(false);
  const chatEndRef = useRef(null);

  const handleAuthentication = (workspace) => {
    setCurrentWorkspace(workspace);
    setIsAuthenticated(true);
    const config = WORKSPACE_CONFIG[workspace];
    
    if (!config || !config.supabaseUrl || !config.supabaseKey) {
      setDbError(`Missing configuration keys for ${workspace}`);
      return;
    }
    setSupabase(createClient(config.supabaseUrl, config.supabaseKey));
    setGeminiKey(config.geminiKey || '');
  };

  // 1. Fetch Master Data
  useEffect(() => {
    if (!supabase) return;

    const bootSystem = async () => {
      setIsLoadingData(true);
      const { data: orderData } = await supabase.from('orders').select('*').order('id', { ascending: false }).limit(2000);
      if (orderData) setOrders(orderData);

      const { data: logData } = await supabase.from('cloud_logs').select('*').order('id', { ascending: false }).limit(100);
      if (logData) setCloudLogs(logData);

      const { data: vpsData } = await supabase.from('fleet_command').select('bot_status').eq('id', 1).single();
      if (vpsData) setVpsStatus(vpsData.bot_status);
      
      setIsLoadingData(false);
    };

    bootSystem();

    const channel = supabase.channel('schema-db-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cloud_logs' }, (payload) => {
        setCloudLogs(prev => [payload.new, ...prev].slice(0, 100));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        supabase.from('orders').select('*').order('id', { ascending: false }).limit(2000).then(({data}) => { if(data) setOrders(data) });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase]);

  // Scroll Chat automatically
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isOracleThinking]);

  // 2. Translated Dashboard Math Engine
  const dashboardStats = useMemo(() => {
    let ordersCurr = 0, ordersPrev = 0, expCodCurr = 0, expCodPrev = 0, secCodCurr = 0, secCodPrev = 0, lostCodCurr = 0, lostCodPrev = 0, delCount = 0, totalFinalized = 0;
    const arrOrders = Array(7).fill(0), arrSec = Array(7).fill(0), arrLost = Array(7).fill(0);
    const now = new Date();

    orders.forEach(row => {
      if (!row.date_processed) return;
      const rowDate = new Date(row.date_processed);
      const diffDays = Math.ceil(Math.abs(now - rowDate) / (1000 * 60 * 60 * 24)); 
      
      let inCurrPeriod = false, isPrevPeriod = false;
      if (dateFilter === 'Today') { inCurrPeriod = diffDays <= 1; isPrevPeriod = diffDays === 2; } 
      else if (dateFilter === 'Last 7 Days') { inCurrPeriod = diffDays <= 7; isPrevPeriod = diffDays > 7 && diffDays <= 14; } 
      else if (dateFilter === 'Last 30 Days') { inCurrPeriod = diffDays <= 30; isPrevPeriod = diffDays > 30 && diffDays <= 60; } 
      else { inCurrPeriod = true; }

      const val = parseFloat(row.cod_balance?.toString().replace(/,/g, '') || 0);
      const status = row.status || '';

      if (inCurrPeriod) {
        ordersCurr++; expCodCurr += val;
        if (status === 'Delivered') { secCodCurr += val; delCount++; totalFinalized++; }
        else if (status === 'Rejected' || status === 'RTS') { lostCodCurr += val; totalFinalized++; }
      } else if (isPrevPeriod) {
        ordersPrev++; expCodPrev += val;
        if (status === 'Delivered') secCodPrev += val;
        else if (status === 'Rejected' || status === 'RTS') lostCodPrev += val;
      }

      if (diffDays <= 7) {
        const idx = 7 - diffDays;
        if(idx >= 0 && idx < 7) {
            arrOrders[idx]++;
            if (status === 'Delivered') arrSec[idx] += val;
            else if (status === 'Rejected' || status === 'RTS') arrLost[idx] += val;
        }
      }
    });

    const calcTrend = (curr, prev) => prev !== 0 ? ((curr - prev) / prev) * 100 : 0.0;
    return {
      ordersCurr, ordersTrend: calcTrend(ordersCurr, ordersPrev), arrOrders,
      secCodCurr, secTrend: calcTrend(secCodCurr, secCodPrev), arrSec,
      lostCodCurr, lostTrend: calcTrend(lostCodCurr, lostCodPrev), arrLost,
      rateCurr: totalFinalized > 0 ? (delCount / totalFinalized) * 100 : 0
    };
  }, [orders, dateFilter]);

  // 3. VPS Toggle (Restored!)
  const toggleVPS = async () => {
    if (!supabase) return;
    setIsToggling(true);
    const newStatus = vpsStatus === 'RUNNING' ? 'STOPPED' : 'RUNNING';
    const { error } = await supabase.from('fleet_command').update({ bot_status: newStatus }).eq('id', 1);
    if (!error) setVpsStatus(newStatus);
    setIsToggling(false);
  };

  // Zero-Touch VPS Updater
  const triggerFleetUpdate = async () => {
    if (!supabase) return;
    setIsUpdatingCode(true);
    
    const { error } = await supabase
      .from('fleet_command')
      .update({ update_requested: true })
      .eq('id', 1);
      
    if (!error) {
      // Optional: Add a temporary success state here, or just use a clean browser alert
      alert("☁️ [CMD] ZERO-TOUCH UPDATE signal sent to Fleet Node. It will now pull from GitHub and restart.");
    } else {
      alert("❌ Failed to send update command to VPS.");
    }
    
    setIsUpdatingCode(false);
  };

  // 4. Gemini Rest API Helper
  const callGeminiAPI = async (prompt, systemInstruction = null) => {
    if (!geminiKey) throw new Error("API Key Missing");
    const payload = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7 }
    };
    if (systemInstruction) {
      payload.systemInstruction = { parts: [{ text: systemInstruction }] };
    }
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.candidates[0].content.parts[0].text;
  };

  // 5. Lighthouse Engine (Restored!)
  const generateLighthouseForecast = async () => {
    if (!geminiKey) return setLighthouseText("❌ Missing Gemini API Key in config.");
    setIsLighthouseLoading(true);
    setLighthouseText("⏳ Cloud AI Lighthouse is scanning your Database...");
    
    let total_delivered = 0, total_rts = 0, in_transit = 0;
    let region_stats = {};
    
    orders.forEach(row => {
      const status = row.status || '';
      const addr = row.full_address || '';
      if (status === 'Delivered') total_delivered++;
      else if (['Rejected', 'RTS'].includes(status)) total_rts++;
      else if (status.includes('SPX') || status.includes('JNT') || status.includes('Lalamove')) in_transit++;
      
      const parts = addr.split(',').map(p => p.trim());
      if (parts.length >= 3) {
        const region = !isNaN(parts[parts.length-1]) ? parts[parts.length-3] : parts[parts.length-2];
        if (region) {
          if (!region_stats[region]) region_stats[region] = { total: 0, rts: 0 };
          region_stats[region].total++;
          if (['Rejected', 'RTS'].includes(status)) region_stats[region].rts++;
        }
      }
    });

    let worst_region = "None", highest_rate = 0;
    Object.entries(region_stats).forEach(([reg, stats]) => {
      if (stats.total >= 3) {
        const rate = stats.rts / stats.total;
        if (rate > highest_rate) { highest_rate = rate; worst_region = `${reg} (${(rate*100).toFixed(0)}%, ${stats.rts}/${stats.total})`; }
      }
    });

    const lenses = [
      "Focus ruthlessly on identifying trapped working capital and accelerating cash conversion cycles.",
      "Focus purely on courier accountability, transit bottlenecks, and predicting which parcels will fail.",
      "Act as a strict Loss-Prevention auditor. Focus entirely on stopping RTS bleeding and geo-risk.",
      "Act as an operational growth strategist. How can we optimize the current successful deliveries to scale faster?"
    ];
    const chosen_lens = lenses[Math.floor(Math.random() * lenses.length)];
    const ai_prompt = `You are an e-commerce financial analyst. Analyze this live data and write 3 actionable insights in Taglish. \nCRITICAL INSTRUCTION: ${chosen_lens}\nData: Delivered: ${total_delivered}. RTS: ${total_rts}. Transit: ${in_transit}. Worst Region: ${worst_region}.`;

    try {
      let aiText = await callGeminiAPI(ai_prompt);
      setLighthouseText(`[FORECAST LENS: ${chosen_lens.split('.')[0]}]\n\n${aiText.replace(/\*/g, '')}`);
    } catch (e) {
      setLighthouseText(`❌ AI Error: ${e.message}`);
    }
    setIsLighthouseLoading(false);
  };

  // 6. System Oracle Engine (Restored!)
  const handleOracleSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || isOracleThinking) return;
    
    const userMessage = chatInput.trim();
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsOracleThinking(true);

    // Dimension Compression (Hidden Data)
    let total_orders = orders.length;
    let rev = dashboardStats.secCodCurr;
    let rtsCount = orders.filter(o => o.status === 'RTS' || o.status === 'Rejected').length;

    const full_context = `
    [INVISIBLE BACKGROUND DATA - DO NOT SUMMARIZE OR BRING UP UNLESS SPECIFICALLY ASKED]
    TOTAL ORDERS: ${total_orders}
    SECURED REVENUE: P${rev}
    TOTAL RTS/REJECTED: ${rtsCount}
    -----------------------------------------------------
    COO MESSAGE: "${userMessage}"
    `;

    const systemInstruction = `
    You are the 'iSupply Omni-Oracle', a high-tier AI Executive Partner to the COO. 
    You are a fusion of a Data Scientist and a Creative Business Strategist who understands Meta Andromeda algorithms and supply chain theory.
    CRITICAL CONVERSATIONAL RULES:
    1. ACT HUMAN: If the COO just says "Hi", reply naturally and casually. 
    2. DO NOT DUMP DATA UNPROMPTED unless explicitly asked about sales, RTS, or numbers.
    3. BE CONCISE: Keep answers punchy.
    COMMANDS: Output [COMMAND: START_FLEET] or [COMMAND: STOP_FLEET] exactly as written if you think the user wants to start or stop the VPS automation bot.
    `;

    try {
      let aiText = await callGeminiAPI(full_context, systemInstruction);
      
      // Action Parser
      if (aiText.includes("[COMMAND: START_FLEET]")) {
        await supabase.from('fleet_command').update({ bot_status: 'RUNNING' }).eq('id', 1);
        aiText = aiText.replace("[COMMAND: START_FLEET]", "⚙️ SYSTEM: Fleet Ignited.");
        setVpsStatus('RUNNING');
      } else if (aiText.includes("[COMMAND: STOP_FLEET]")) {
        await supabase.from('fleet_command').update({ bot_status: 'STOPPED' }).eq('id', 1);
        aiText = aiText.replace("[COMMAND: STOP_FLEET]", "⚙️ SYSTEM: Fleet Halted.");
        setVpsStatus('STOPPED');
      }

      setChatHistory(prev => [...prev, { role: 'ai', text: aiText }]);
    } catch (e) {
      setChatHistory(prev => [...prev, { role: 'ai', text: `❌ Oracle Error: ${e.message}` }]);
    }
    setIsOracleThinking(false);
  };

  if (!isAuthenticated) return <LoginScreen onAuthenticate={handleAuthentication} />;

  return (
    <div className="min-h-screen bg-[#0B0F19] text-gray-100 flex flex-col font-sans">
      <header className="bg-[#111827] border-b border-gray-800 px-8 py-4 flex justify-between items-center shadow-md z-10">
        <div className="flex items-center space-x-4">
          <div className="h-10 w-10 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center justify-center">
            <DatabaseZap className="text-emerald-500 h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-white tracking-widest">iSUPPLY FLEET COMMAND</h1>
            <p className="text-emerald-500 font-bold uppercase tracking-wider text-xs flex items-center mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse"></span>
              {currentWorkspace} // ONLINE
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 bg-[#111827] border-r border-gray-800 flex flex-col pt-6">
          <nav className="flex-1 px-4 space-y-2">
            <button onClick={() => setActiveTab('analytics')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg font-bold transition-all ${activeTab === 'analytics' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}><Activity className="h-5 w-5" /> <span>Live Summary</span></button>
            <button onClick={() => setActiveTab('engine')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg font-bold transition-all ${activeTab === 'engine' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}><Cpu className="h-5 w-5" /> <span>Fulfillment Engine</span></button>
            <button onClick={() => setActiveTab('oracle')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg font-bold transition-all ${activeTab === 'oracle' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}><Bot className="h-5 w-5" /> <span>System Oracle (AI)</span></button>
            <button onClick={() => setActiveTab('logs')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg font-bold transition-all ${activeTab === 'logs' ? 'bg-gray-700 text-white border border-gray-600' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}><TerminalSquare className="h-5 w-5" /> <span>Telemetry</span></button>
          </nav>
        </aside>

        <main className="flex-1 overflow-y-auto p-8">
          
          {/* TAB 1: ANALYTICS */}
          {activeTab === 'analytics' && (
            <div className="space-y-6 fade-in">
              <div className="flex justify-between items-end mb-4">
                <h2 className="text-2xl font-bold text-white">Store Logistics & Delivery</h2>
                <div className="flex items-center space-x-2 bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="bg-transparent text-white font-semibold focus:outline-none text-sm cursor-pointer">
                    <option value="Today">Today</option><option value="Last 7 Days">Last 7 Days</option><option value="Last 30 Days">Last 30 Days</option><option value="All Time">All Time</option>
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <TripleWhaleCard title="🛍️ TOTAL ORDERS" value={dashboardStats.ordersCurr} trendPct={dashboardStats.ordersTrend} data={dashboardStats.arrOrders} color="#3b82f6" />
                <TripleWhaleCard title="💰 SECURED CASH" value={`₱${dashboardStats.secCodCurr.toLocaleString()}`} trendPct={dashboardStats.secTrend} data={dashboardStats.arrSec} color="#10b981" />
                <TripleWhaleCard title="⚠️ LOST COGS (RTS)" value={`₱${dashboardStats.lostCodCurr.toLocaleString()}`} trendPct={dashboardStats.lostTrend} data={dashboardStats.arrLost} color="#ef4444" />
              </div>
              <p className="text-gray-500 text-sm mt-2 text-right font-bold">🎯 Finalized Delivery Rate: {dashboardStats.rateCurr.toFixed(1)}%</p>

              {/* LIGHTHOUSE INSIGHTS RESTORED */}
              <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-white flex items-center">
                    <Sparkles className="mr-2 h-5 w-5 text-yellow-500" /> Lighthouse Insights
                  </h3>
                  <button 
                    onClick={generateLighthouseForecast} 
                    disabled={isLighthouseLoading}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center transition-all disabled:opacity-50"
                  >
                    {isLighthouseLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> SCANNING...</> : "Generate Financial Forecast"}
                  </button>
                </div>
                <div className="bg-[#1F2937] border border-gray-800 rounded-xl p-5 shadow-inner">
                  <p className="text-gray-300 whitespace-pre-wrap font-mono text-sm leading-relaxed">{lighthouseText}</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: VPS ENGINE RESTORED */}
          {/* TAB 2: VPS ENGINE RESTORED */}
          {activeTab === 'engine' && (
            <div className="max-w-3xl fade-in">
              <h2 className="text-2xl font-bold text-white mb-6">Cloud Fulfillment Engine</h2>
              <div className="bg-[#1F2937] border border-gray-800 rounded-xl p-8 shadow-xl">
                
                {/* Header */}
                <div className="flex items-center justify-between mb-8 pb-8 border-b border-gray-800">
                  <div>
                    <h3 className="text-xl font-bold text-white flex items-center">
                      <Cpu className="mr-3 text-blue-400" /> VPS Automation Node
                    </h3>
                    <p className="text-gray-400 mt-2">Controls the headless Python worker deployed on your cloud server. When active, it will continuously scrape Shopify, generate SPX waybills, and dispatch SMS alerts.</p>
                  </div>
                </div>

                {/* The IGNITE / HALT Button */}
                <div className="flex items-center justify-between bg-[#111827] p-6 rounded-lg border border-gray-800">
                  <div>
                    <div className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-1">Current State</div>
                    <div className={`text-2xl font-black ${vpsStatus === 'RUNNING' ? 'text-emerald-500' : 'text-red-500'}`}>{vpsStatus}</div>
                  </div>
                  <button 
                    onClick={toggleVPS} disabled={isToggling || vpsStatus === 'UNKNOWN'}
                    className={`flex items-center px-8 py-4 rounded-lg font-bold text-white shadow-lg transition-all ${vpsStatus === 'RUNNING' ? 'bg-red-600 hover:bg-red-500 border-red-700' : 'bg-emerald-600 hover:bg-emerald-500 border-emerald-700'} disabled:opacity-50 border`}
                  >
                    {isToggling ? <><RefreshCw className="mr-2 h-5 w-5 animate-spin" /> SENDING COMMAND...</> : vpsStatus === 'RUNNING' ? <><Square className="mr-2 h-5 w-5 fill-current" /> HALT FLEET WORKER</> : <><Play className="mr-2 h-5 w-5 fill-current" /> IGNITE FLEET WORKER</>}
                  </button>
                </div>

                {/* ZERO-TOUCH UPDATE BUTTON */}
                <div className="mt-6 pt-6 border-t border-gray-800 flex justify-between items-center">
                  <div>
                    <h4 className="text-white font-bold text-sm">Deploy Code Update</h4>
                    <p className="text-gray-500 text-xs mt-1">Signals the VPS to pull the latest commit from GitHub and reboot.</p>
                  </div>
                  <button 
                    onClick={triggerFleetUpdate}
                    disabled={isUpdatingCode}
                    className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-sm transition-all disabled:opacity-50 shadow-md border border-blue-700"
                  >
                    {isUpdatingCode ? (
                      <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> SENDING...</>
                    ) : (
                      <><Download className="mr-2 h-4 w-4" /> UPDATE FLEET CODE</>
                    )}
                  </button>
                </div>

              </div>
            </div>
          )}

          {/* TAB 3: SYSTEM ORACLE (AI CHAT) RESTORED */}
          {activeTab === 'oracle' && (
             <div className="flex flex-col h-[80vh] bg-[#1F2937] border border-gray-800 rounded-xl shadow-xl overflow-hidden fade-in">
               <div className="bg-[#111827] p-4 border-b border-gray-800 flex items-center">
                 <Bot className="h-6 w-6 text-purple-400 mr-3" />
                 <h3 className="font-bold text-white">System Oracle (Gemini 2.5)</h3>
               </div>
               
               <div className="flex-1 overflow-y-auto p-6 space-y-4">
                 {chatHistory.map((msg, idx) => (
                   <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                     <div className={`max-w-[80%] p-4 rounded-xl text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-200 border border-gray-700'}`}>
                       {msg.role === 'ai' && <strong className="block mb-1 text-purple-400">Oracle</strong>}
                       <span className="whitespace-pre-wrap">{msg.text}</span>
                     </div>
                   </div>
                 ))}
                 {isOracleThinking && (
                   <div className="flex justify-start">
                     <div className="bg-gray-800 text-gray-400 border border-gray-700 p-4 rounded-xl text-sm italic flex items-center">
                       <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Oracle is analyzing database...
                     </div>
                   </div>
                 )}
                 <div ref={chatEndRef} />
               </div>

               <form onSubmit={handleOracleSubmit} className="p-4 bg-[#111827] border-t border-gray-800 flex">
                 <input 
                   type="text" 
                   value={chatInput} 
                   onChange={(e) => setChatInput(e.target.value)}
                   placeholder="Ask me about your current operations or type 'Start Fleet'..."
                   className="flex-1 bg-gray-800 border border-gray-700 rounded-l-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                 />
                 <button 
                   type="submit" 
                   disabled={isOracleThinking || !chatInput.trim()}
                   className="bg-purple-600 hover:bg-purple-500 text-white px-6 rounded-r-lg font-bold flex items-center transition-colors disabled:opacity-50"
                 >
                   <Send className="w-5 h-5" />
                 </button>
               </form>
             </div>
          )}

          {/* TAB 4: TELEMETRY LOGS */}
          {activeTab === 'logs' && (
             <div className="h-[80vh] flex flex-col fade-in">
               <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
                 <TerminalSquare className="mr-3 text-gray-400" /> Cloud Telemetry Stream
               </h2>
               <div className="flex-1 bg-[#111827] border border-gray-800 rounded-xl p-6 font-mono text-sm overflow-y-auto shadow-inner">
                 {cloudLogs.length === 0 ? (
                   <div className="text-gray-600 flex items-center"><Loader2 className="w-4 h-4 mr-2 animate-spin"/> Monitoring for events...</div>
                 ) : (
                   cloudLogs.map((log) => (
                     <div key={log.id} className={`mb-2 pb-2 border-b border-gray-800/50 ${log.message.includes('❌') || log.message.includes('ERROR') ? 'text-red-400' : 'text-gray-300'}`}>
                       <span className="text-gray-600 mr-3">[{new Date(log.created_at).toLocaleTimeString()}]</span>
                       {log.message}
                     </div>
                   ))
                 )}
               </div>
             </div>
          )}

        </main>
      </div>
    </div>
  );
}