import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import LoginScreen from './LoginScreen';
import { WORKSPACE_CONFIG } from './config';
import { 
  Loader2, Activity, Bot, TerminalSquare, DatabaseZap, Play, Square, RefreshCw, 
  Send, Sparkles, Cpu, Download, LogOut, TrendingUp, TrendingDown, AlertCircle, 
  Package, Truck, CheckCircle2, XCircle, RefreshCcw, DollarSign 
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
  
  // VPS & Shopify State (UPDATED)
  const [vpsStatus, setVpsStatus] = useState('UNKNOWN');
  const [shopifyStats, setShopifyStats] = useState({
    totalOrders: 0,
    totalSales: 0,
    cancelled: 0
  });
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

  // ✅ ADD THESE TWO NEW STATES FOR THE MANUAL RESOLUTION CENTER:
  const [manualSearch, setManualSearch] = useState('');
  const [resolvingId, setResolvingId] = useState(null);

  // --- AUTO-LOGIN CHECKER ---
  useEffect(() => {
    const savedWorkspace = localStorage.getItem('isupply_fleet_workspace');
    if (savedWorkspace && WORKSPACE_CONFIG[savedWorkspace]) {
      handleAuthentication(savedWorkspace);
    }
  }, []);

  const handleAuthentication = (workspace) => {
    setCurrentWorkspace(workspace);
    setIsAuthenticated(true);
    localStorage.setItem('isupply_fleet_workspace', workspace);
    
    const config = WORKSPACE_CONFIG[workspace];
    if (!config || !config.supabaseUrl || !config.supabaseKey) {
      setDbError(`Missing configuration keys for ${workspace}`);
      return;
    }
    setSupabase(createClient(config.supabaseUrl, config.supabaseKey));
    setGeminiKey(config.geminiKey || '');
  };

  const handleLogout = () => {
    localStorage.removeItem('isupply_fleet_workspace');
    setIsAuthenticated(false);
    setCurrentWorkspace('');
    setSupabase(null);
  };

  // 1. Fetch Master Data & INSTANT REALTIME ENGINE (Zero Disk I/O)
  useEffect(() => {
    if (!supabase) return;

    // --- A. INITIAL LOAD (Runs exactly ONCE when you open the page) ---
    const bootSystem = async () => {
      setIsLoadingData(true);
      
      // ✅ FIX: Reduced from 3000 to 800 to prevent database crashing on load
      const { data: orderData } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(800);
      if (orderData) setOrders(orderData);

      // Load recent logs
      const { data: logData } = await supabase.from('cloud_logs').select('*').order('created_at', { ascending: false }).limit(50);
      if (logData) setCloudLogs(logData);

      // Load fleet settings
      const { data: vpsData } = await supabase.from('fleet_command').select('*').eq('id', 1).single();
      if (vpsData) {
        setVpsStatus(vpsData.bot_status);
        setShopifyStats({
          totalOrders: vpsData.daily_shopify_kpi || 0,
          totalSales: vpsData.daily_shopify_sales || 0,
          cancelled: vpsData.daily_shopify_cancelled || 0
        });
      }
      setIsLoadingData(false);
    };

    bootSystem();

    // --- B. SUPABASE REALTIME WEBSOCKETS (Instant UI, 0 Disk I/O) ---
    const realtimeChannel = supabase.channel('isupply_live_feed')
      
      // 1. Listen for Live ORDER Updates & Inserts
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const newOrder = payload.new;
          setOrders(prev => {
            const existingMap = new Map(prev.map(o => [o.order_number, o]));
            existingMap.set(newOrder.order_number, newOrder); // Add or Update
            
            // Keep it mathematically sorted
            return Array.from(existingMap.values()).sort((a, b) => {
              const numA = parseInt(a.order_number?.replace(/\D/g, '') || 0);
              const numB = parseInt(b.order_number?.replace(/\D/g, '') || 0);
              return numB - numA;
            });
          });
        }
        // If you delete an order from the database, instantly remove it from the dashboard
        if (payload.eventType === 'DELETE') {
          setOrders(prev => prev.filter(o => o.id !== payload.old.id));
        }
      })

      // 2. Listen for Live CLOUD LOGS (Watchdog/Worker console logs)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cloud_logs' }, (payload) => {
        const newLog = payload.new;
        // Add new log to the top, keep only the latest 50 to prevent lag
        setCloudLogs(prev => [newLog, ...prev].slice(0, 50));
      })

      // 3. Listen for Live FLEET COMMAND Updates (Shopify stats, Start/Stop)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'fleet_command' }, (payload) => {
        const newData = payload.new;
        if (newData.id === 1) {
          setVpsStatus(newData.bot_status);
          setShopifyStats({
            totalOrders: newData.daily_shopify_kpi || 0,
            totalSales: newData.daily_shopify_sales || 0,
            cancelled: newData.daily_shopify_cancelled || 0
          });
        }
      })
      .subscribe();

    // --- C. CLEANUP (Closes the WebSocket if you close the browser tab) ---
    return () => {
      supabase.removeChannel(realtimeChannel);
    };
  }, [supabase]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isOracleThinking]);

  // 2. EXECUTIVE COMMAND CENTER MATH ENGINE (UPDATED: Stripped frontend row 1 math)
  const metrics = useMemo(() => {
    const now = new Date();
    
    // --- STRICT PHT DATE FORMATTER ---
    const options = {
      timeZone: 'Asia/Manila',
      month: '2-digit',
      day: '2-digit',
      year: 'numeric'
    };
    
    const todayPHT = new Intl.DateTimeFormat('en-US', options).format(now);
    const yesterdayDate = new Date(now.getTime() - (24 * 60 * 60 * 1000));
    const yesterdayPHT = new Intl.DateTimeFormat('en-US', options).format(yesterdayDate);
    const sevenDaysAgoTime = now.getTime() - (7 * 24 * 60 * 60 * 1000);
    const parseCOD = (val) => parseFloat(val?.toString().replace(/,/g, '') || 0);

    // --- ROW 1: REVENUE & PIPELINE ---
    const yesterdayOrdersCount = orders.filter(o => o.date_processed === yesterdayPHT).length;
    const orderTrend = yesterdayOrdersCount > 0 ? ((shopifyStats.totalOrders - yesterdayOrdersCount) / yesterdayOrdersCount) * 100 : 0;

    const todayOrders = orders.filter(o => o.date_processed === todayPHT);
    
    const cashInTransit = orders
      .filter(o => o.status === 'In Transit' || o.status === 'Out for Delivery')
      .reduce((sum, o) => sum + parseCOD(o.cod_balance), 0);

    // --- ROW 2: LOGISTICS ROUTING ---
    const spxProcessed = todayOrders.filter(o => o.status === 'Fulfilled (SPX)').length;
    const jntFallback = todayOrders.filter(o => o.status === 'Sent to Slack (JNT Fallback)').length;
    const lalamoveSameDay = todayOrders.filter(o => o.status === 'Sent to Slack (Lalamove)').length;
    const actionRequired = orders.filter(o => o.status === 'Sent to Slack (Missing Info)').length;

    // --- ROW 3: LAST MILE OUTCOMES ---
    const deliveredToday = todayOrders.filter(o => o.status === 'Delivered').length;
    const rejectedToday = todayOrders.filter(o => o.status === 'Rejected').length;
    const rtsToday = todayOrders.filter(o => ['RTS', 'Returning', 'Returned'].includes(o.status)).length;

    // Delivery Success Rate (7-Day Rolling)
    const rollingOrders = orders.filter(o => {
      if (!o.date_processed) return false;
      const d = new Date(o.date_processed);
      if (isNaN(d.getTime())) return false;
      return d.getTime() >= sevenDaysAgoTime;
    });
    
    let rollingDelivered = 0;
    let rollingFailed = 0;
    
    rollingOrders.forEach(o => {
      if (o.status === 'Delivered') rollingDelivered++;
      else if (['RTS', 'Rejected', 'Returning', 'Returned'].includes(o.status)) rollingFailed++;
    });

    const totalFinalizedRolling = rollingDelivered + rollingFailed;
    const deliverySuccessRate = totalFinalizedRolling > 0 ? (rollingDelivered / totalFinalizedRolling) * 100 : 0;

    return {
      orderTrend, cashInTransit,
      spxProcessed, jntFallback, lalamoveSameDay, actionRequired,
      deliveredToday, rejectedToday, rtsToday, deliverySuccessRate
    };
  }, [orders, shopifyStats]); // Added shopifyStats dependency

  const formatPHP = (val) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0 }).format(val);

  // 3. VPS Controls
  const toggleVPS = async () => {
    if (!supabase) return;
    setIsToggling(true);
    const newStatus = vpsStatus === 'RUNNING' ? 'STOPPED' : 'RUNNING';
    const { error } = await supabase.from('fleet_command').update({ bot_status: newStatus }).eq('id', 1);
    if (!error) setVpsStatus(newStatus);
    setIsToggling(false);
  };

  const triggerFleetUpdate = async () => {
    if (!supabase) return;
    setIsUpdatingCode(true);
    const { error } = await supabase.from('fleet_command').update({ update_requested: true }).eq('id', 1);
    if (!error) alert("☁️ [CMD] ZERO-TOUCH UPDATE signal sent to Fleet Node.");
    setIsUpdatingCode(false);
  };

  // 4. Gemini API Helper
  const callGeminiAPI = async (prompt, systemInstruction = null) => {
    if (!geminiKey) throw new Error("API Key Missing");
    const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7 } };
    if (systemInstruction) payload.systemInstruction = { parts: [{ text: systemInstruction }] };
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    
    // ✅ ADD THIS: Safe extraction
    if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content) {
       throw new Error("AI responded with an empty or blocked message.");
    }
    
    return data.candidates[0].content.parts[0].text;
  };

  // 5. Lighthouse Engine
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

    const lenses = ["Focus ruthlessly on identifying trapped working capital and accelerating cash conversion cycles.", "Focus purely on courier accountability, transit bottlenecks, and predicting which parcels will fail.", "Act as a strict Loss-Prevention auditor. Focus entirely on stopping RTS bleeding and geo-risk.", "Act as an operational growth strategist. How can we optimize the current successful deliveries to scale faster?"];
    const chosen_lens = lenses[Math.floor(Math.random() * lenses.length)];
    const ai_prompt = `You are an e-commerce financial analyst. Analyze this live data and write 3 actionable insights in Taglish. \nCRITICAL INSTRUCTION: ${chosen_lens}\nData: Delivered: ${total_delivered}. RTS: ${total_rts}. Transit: ${in_transit}. Worst Region: ${worst_region}.`;

    try {
      let aiText = await callGeminiAPI(ai_prompt);
      setLighthouseText(`[FORECAST LENS: ${chosen_lens.split('.')[0]}]\n\n${aiText.replace(/\*/g, '')}`);
    } catch (e) { setLighthouseText(`❌ AI Error: ${e.message}`); }
    setIsLighthouseLoading(false);
  };

  // 6. Oracle Chat Engine
  const handleOracleSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || isOracleThinking) return;
    
    const userMessage = chatInput.trim();
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsOracleThinking(true);

    const full_context = `[INVISIBLE BACKGROUND DATA] TOTAL ORDERS: ${orders.length}\nCOO MESSAGE: "${userMessage}"`;
    const systemInstruction = `You are the 'iSupply Omni-Oracle', AI Executive Partner to the COO. Keep answers punchy. COMMANDS: Output [COMMAND: START_FLEET] or [COMMAND: STOP_FLEET] if the user wants to start/stop the VPS bot.`;

    try {
      let aiText = await callGeminiAPI(full_context, systemInstruction);
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
    } catch (e) { setChatHistory(prev => [...prev, { role: 'ai', text: `❌ Oracle Error: ${e.message}` }]); }
    setIsOracleThinking(false);
  };

  // ✅ STEP 2 POSTED HERE:
  const handleManualDeliver = async (orderId, orderNumber) => {
    if (!supabase) return;
    setResolvingId(orderNumber); // Changed to orderNumber
    
    try {
      // ✅ FIX: Tell Supabase to search by 'order_number' instead of 'id'
      await supabase.from('orders').update({ status: 'Delivered' }).eq('order_number', orderNumber);
      
      const timeStr = new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Manila' });
      await supabase.from('cloud_logs').insert({ 
        message: `[${timeStr}] [MANUAL] 🟢 Order ${orderNumber} marked as Delivered via Dashboard.` 
      });

      // Instantly update the UI
      setOrders(prev => prev.map(o => o.order_number === orderNumber ? { ...o, status: 'Delivered' } : o));
      
    } catch (error) {
      console.error("Failed to update order:", error);
    }
    setResolvingId(null);
  };

  if (!isAuthenticated) return <LoginScreen onAuthenticate={handleAuthentication} />;

  return (
    <div className="h-screen bg-[#0B0F19] text-gray-100 flex flex-col font-sans overflow-hidden">
      
      {/* HEADER */}
      <header className="bg-[#111827] border-b border-gray-800 px-4 md:px-8 py-3 md:py-4 flex justify-between items-center shadow-md z-10 shrink-0">
        <div className="flex items-center space-x-3 md:space-x-4">
          <div className="h-8 w-8 md:h-10 md:w-10 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center justify-center">
            <DatabaseZap className="text-emerald-500 h-5 w-5 md:h-6 md:w-6" />
          </div>
          <div>
            <h1 className="text-md md:text-xl font-extrabold text-white tracking-widest leading-tight">FLEET COMMAND</h1>
            <p className="text-emerald-500 font-bold uppercase tracking-wider text-[10px] md:text-xs flex items-center mt-0.5 md:mt-1">
              <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-emerald-500 mr-1.5 md:mr-2 animate-pulse"></span>
              {currentWorkspace}
            </p>
          </div>
        </div>
        
        <button 
          onClick={handleLogout}
          className="flex items-center text-gray-400 hover:text-white text-xs md:text-sm font-bold border border-gray-700 bg-gray-800 px-3 py-1.5 md:px-4 md:py-2 rounded-lg transition-colors shadow-sm hover:bg-gray-700"
        >
          <LogOut className="h-3 w-3 md:h-4 md:w-4 mr-1.5" />
          <span className="hidden sm:inline">DISCONNECT</span>
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        
        {/* DESKTOP SIDEBAR */}
        <aside className="hidden md:flex w-64 bg-[#111827] border-r border-gray-800 flex-col pt-6 shrink-0">
          <nav className="flex-1 px-4 space-y-2">
            <button onClick={() => setActiveTab('analytics')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg font-bold transition-all ${activeTab === 'analytics' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}><Activity className="h-5 w-5" /> <span>Command Center</span></button>
            <button onClick={() => setActiveTab('engine')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg font-bold transition-all ${activeTab === 'engine' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}><Cpu className="h-5 w-5" /> <span>Fulfillment Engine</span></button>
            <button onClick={() => setActiveTab('oracle')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg font-bold transition-all ${activeTab === 'oracle' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}><Bot className="h-5 w-5" /> <span>System Oracle (AI)</span></button>
            <button onClick={() => setActiveTab('logs')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg font-bold transition-all ${activeTab === 'logs' ? 'bg-gray-700 text-white border border-gray-600' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}><TerminalSquare className="h-5 w-5" /> <span>Telemetry</span></button>
          </nav>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8 w-full">
          
          {/* ================= TAB 1: EXECUTIVE COMMAND CENTER ================= */}
          {activeTab === 'analytics' && (
            <div className="space-y-6 fade-in max-w-7xl mx-auto">
              
              <div className="mb-6">
                <h2 className="text-2xl md:text-3xl font-bold text-white tracking-wide">Executive Command Center</h2>
                <p className="text-gray-400 mt-1 text-sm md:text-base">Live Logistics & Pipeline Outcomes</p>
              </div>
              
              {/* 3x4 CSS Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                
                {/* ROW 1: REVENUE & PIPELINE (UPDATED to use shopifyStats) */}
                <MetricCard 
                  title="Raw Shopify Orders (Today)" 
                  value={shopifyStats.totalOrders} 
                  icon={<Package className="text-blue-400" />}
                  trend={metrics.orderTrend}
                />
                <MetricCard 
                  title="Total Sales (Shopify API)" 
                  value={formatPHP(shopifyStats.totalSales)} 
                  icon={<DollarSign className="text-emerald-400" />}
                />
                <MetricCard 
                  title="Cancelled in Shopify" 
                  value={shopifyStats.cancelled} 
                  icon={<XCircle className="text-red-400" />}
                />
                <MetricCard 
                  title="Cash in Transit (Active)" 
                  value={formatPHP(metrics.cashInTransit)} 
                  icon={<Truck className="text-purple-400" />}
                />

                {/* ROW 2: LOGISTICS ROUTING */}
                <MetricCard 
                  title="Processed via SPX" 
                  value={metrics.spxProcessed} 
                  icon={<CheckCircle2 className="text-orange-500" />}
                />
                <MetricCard 
                  title="JNT Fallback" 
                  value={metrics.jntFallback} 
                  icon={<RefreshCcw className="text-red-500" />}
                />
                <MetricCard 
                  title="Lalamove (Same Day)" 
                  value={metrics.lalamoveSameDay} 
                  icon={<Truck className="text-yellow-500" />}
                />
                
                {/* Action Required - Highlighted Card */}
                <div className="bg-[#1f0f0f] border-2 border-red-500/50 rounded-xl p-5 shadow-[0_0_15px_rgba(239,68,68,0.15)] flex flex-col justify-between transform transition-all hover:-translate-y-1">
                  <div className="flex justify-between items-start">
                    <h3 className="text-red-400 font-bold text-xs md:text-sm tracking-wide">Action Required (CS)</h3>
                    <AlertCircle className="text-red-500 animate-pulse h-5 w-5" />
                  </div>
                  <div className="mt-4">
                    <span className="text-3xl md:text-4xl font-black text-white">{metrics.actionRequired}</span>
                    <p className="text-[10px] md:text-xs text-red-400/80 mt-1 font-semibold uppercase tracking-wider">Missing Info / Unresolved</p>
                  </div>
                </div>

                {/* ROW 3: LAST MILE OUTCOMES */}
                <MetricCard 
                  title="Delivered Today" 
                  value={metrics.deliveredToday} 
                  icon={<CheckCircle2 className="text-emerald-500" />}
                />
                <MetricCard 
                  title="Rejected by Customer" 
                  value={metrics.rejectedToday} 
                  icon={<XCircle className="text-red-500" />}
                />
                <MetricCard 
                  title="RTS (Returned to Sender)" 
                  value={metrics.rtsToday} 
                  icon={<RefreshCcw className="text-orange-500" />}
                />
                
                {/* Success Rate Card with Color Logic */}
                <div className="bg-[#1F2937] border border-gray-800 rounded-xl p-5 shadow-lg flex flex-col justify-between transform transition-all hover:-translate-y-1 hover:border-gray-700">
                  <div className="flex justify-between items-start">
                    <h3 className="text-gray-400 font-bold text-xs md:text-sm tracking-wide">Delivery Success (7-Day)</h3>
                    <TrendingUp className="text-gray-500 h-5 w-5" />
                  </div>
                  <div className="mt-4">
                    <span className={`text-3xl md:text-4xl font-black ${
                      metrics.deliverySuccessRate >= 85 ? 'text-emerald-500' : 
                      metrics.deliverySuccessRate < 80 ? 'text-red-500' : 'text-yellow-500'
                    }`}>
                      {metrics.deliverySuccessRate.toFixed(1)}%
                    </span>
                  </div>
                </div>

              </div>

              {/* LIGHTHOUSE INSIGHTS */}
              <div className="mt-10">
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-3">
                  <h3 className="text-lg md:text-xl font-bold text-white flex items-center">
                    <Sparkles className="mr-2 h-5 w-5 text-yellow-500 shrink-0" /> Lighthouse Insights
                  </h3>
                  <button onClick={generateLighthouseForecast} disabled={isLighthouseLoading} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-3 md:py-2 rounded-lg font-bold text-sm flex items-center justify-center transition-all disabled:opacity-50 w-full md:w-auto">
                    {isLighthouseLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> SCANNING...</> : "Generate Forecast"}
                  </button>
                </div>
                <div className="bg-[#1F2937] border border-gray-800 rounded-xl p-4 md:p-5 shadow-inner">
                  <p className="text-gray-300 whitespace-pre-wrap font-mono text-xs md:text-sm leading-relaxed overflow-x-auto">{lighthouseText}</p>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 2: VPS ENGINE ================= */}
          {activeTab === 'engine' && (
            <div className="max-w-3xl mx-auto fade-in">
              <h2 className="text-xl md:text-2xl font-bold text-white mb-4 md:mb-6">Fulfillment Engine</h2>
              <div className="bg-[#1F2937] border border-gray-800 rounded-xl p-5 md:p-8 shadow-xl">
                
                <div className="flex items-center justify-between mb-6 md:mb-8 pb-6 md:pb-8 border-b border-gray-800">
                  <div>
                    <h3 className="text-lg md:text-xl font-bold text-white flex items-center"><Cpu className="mr-3 text-blue-400" /> VPS Worker Node</h3>
                    <p className="text-gray-400 mt-2 text-xs md:text-sm leading-relaxed">Controls the headless Python worker on your cloud server. Automates Shopify, SPX, and SMS.</p>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row md:items-center justify-between bg-[#111827] p-4 md:p-6 rounded-lg border border-gray-800 gap-4">
                  <div>
                    <div className="text-xs md:text-sm font-bold text-gray-500 uppercase tracking-widest mb-1">Current State</div>
                    <div className={`text-xl md:text-2xl font-black ${vpsStatus === 'RUNNING' ? 'text-emerald-500' : 'text-red-500'}`}>{vpsStatus}</div>
                  </div>
                  <button 
                    onClick={toggleVPS} disabled={isToggling || vpsStatus === 'UNKNOWN'}
                    className={`flex items-center justify-center px-6 py-4 rounded-lg font-bold text-white shadow-lg transition-all ${vpsStatus === 'RUNNING' ? 'bg-red-600 hover:bg-red-500 border-red-700' : 'bg-emerald-600 hover:bg-emerald-500 border-emerald-700'} disabled:opacity-50 border w-full md:w-auto`}
                  >
                    {isToggling ? <><RefreshCw className="mr-2 h-5 w-5 animate-spin" /> SENDING...</> : vpsStatus === 'RUNNING' ? <><Square className="mr-2 h-5 w-5 fill-current" /> HALT FLEET</> : <><Play className="mr-2 h-5 w-5 fill-current" /> IGNITE FLEET</>}
                  </button>
                </div>

                <div className="mt-6 pt-6 border-t border-gray-800 flex flex-col md:flex-row justify-between md:items-center gap-4">
                  <div>
                    <h4 className="text-white font-bold text-sm">Deploy Code Update</h4>
                    <p className="text-gray-500 text-xs mt-1">Signals the VPS to pull latest commit & reboot.</p>
                  </div>
                  <button 
                    onClick={triggerFleetUpdate} disabled={isUpdatingCode}
                    className="flex items-center justify-center px-4 py-3 md:py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-sm transition-all disabled:opacity-50 w-full md:w-auto border border-blue-700 shadow-md"
                  >
                    {isUpdatingCode ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> SENDING...</> : <><Download className="mr-2 h-4 w-4" /> UPDATE CODE</>}
                  </button>
                </div>
              </div>

              {/* ✅ STEP 3 POSTED HERE: MANUAL RESOLUTION CENTER */}
              <div className="bg-[#1F2937] border border-gray-800 rounded-xl p-5 md:p-8 shadow-xl mt-6">
                <div className="flex items-center justify-between mb-4 md:mb-6 pb-4 border-b border-gray-800">
                  <div>
                    <h3 className="text-lg md:text-xl font-bold text-white flex items-center">
                      <Package className="mr-3 text-yellow-500" /> Manual Resolution Center
                    </h3>
                    <p className="text-gray-400 mt-2 text-xs md:text-sm">
                      Force-close non-SPX orders (Lalamove, J&T) by marking them as Delivered.
                    </p>
                  </div>
                </div>

                <div className="mb-4">
                  <input 
                    type="text" 
                    placeholder="🔍 Search by Order # or Name..." 
                    value={manualSearch}
                    onChange={(e) => setManualSearch(e.target.value)}
                    className="w-full bg-[#111827] border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-yellow-500 transition-colors text-sm"
                  />
                </div>

                <div className="max-h-64 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                  {orders
                    .filter(o => 
                      o.status !== 'Delivered' && 
                      o.status !== 'Returned' && 
                      o.status !== 'RTS' &&
                      o.status !== 'Rejected' &&
                      (o.tracking_number === 'N/A' || !o.tracking_number?.includes('SPEPH'))
                    )
                    .filter(o => 
                      manualSearch === '' || 
                      (o.order_number && o.order_number.toLowerCase().includes(manualSearch.toLowerCase())) || 
                      (o.first_name && o.first_name.toLowerCase().includes(manualSearch.toLowerCase()))
                    )
                    // ✅ ADD THIS ONE LINE RIGHT HERE:
                    .sort((a, b) => parseInt(b.order_number?.replace(/\D/g, '') || 0) - parseInt(a.order_number?.replace(/\D/g, '') || 0))
                    .map(order => (
                      <div key={order.id} className="bg-[#111827] border border-gray-800 rounded-lg p-3 flex justify-between items-center hover:border-gray-700 transition-all">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-white text-sm">{order.order_number}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 border border-gray-700">
                              {order.first_name} {order.last_name}
                            </span>
                          </div>
                          <div className="text-xs text-yellow-500/80 font-semibold mt-1">
                            {order.status}
                          </div>
                        </div>
                        <button 
                          onClick={() => handleManualDeliver(order.id, order.order_number)}
                          disabled={resolvingId === order.order_number}
                          className="bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center disabled:opacity-50"
                        >
                          {resolvingId === order.order_number ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4 mr-1.5" /> DELIVER</>}
                        </button>
                      </div>
                  ))}
                  
                  {orders.filter(o => o.status !== 'Delivered' && o.status !== 'Returned' && o.status !== 'RTS' && o.status !== 'Rejected' && (o.tracking_number === 'N/A' || !o.tracking_number?.includes('SPEPH'))).length === 0 && (
                    <div className="text-center py-6 text-gray-500 text-sm">
                      🎉 No manual orders left to resolve!
                    </div>
                  )}
                </div>
              </div>
              {/* ✅ END OF MANUAL RESOLUTION CENTER */}

            </div>
          )}

          {/* ================= TAB 3: SYSTEM ORACLE ================= */}
          {activeTab === 'oracle' && (
             <div className="flex flex-col h-[calc(100vh-180px)] md:h-[80vh] bg-[#1F2937] border border-gray-800 rounded-xl shadow-xl overflow-hidden fade-in max-w-4xl mx-auto">
               <div className="bg-[#111827] p-3 md:p-4 border-b border-gray-800 flex items-center shrink-0">
                 <Bot className="h-5 w-5 md:h-6 md:w-6 text-purple-400 mr-2 md:mr-3" />
                 <h3 className="font-bold text-white text-sm md:text-base">System Oracle (Gemini 2.5)</h3>
               </div>
               
               <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
                 {chatHistory.map((msg, idx) => (
                   <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                     <div className={`max-w-[85%] md:max-w-[80%] p-3 md:p-4 rounded-xl text-xs md:text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-200 border border-gray-700'}`}>
                       {msg.role === 'ai' && <strong className="block mb-1 text-purple-400">Oracle</strong>}
                       <span className="whitespace-pre-wrap leading-relaxed">{msg.text}</span>
                     </div>
                   </div>
                 ))}
                 {isOracleThinking && (
                   <div className="flex justify-start">
                     <div className="bg-gray-800 text-gray-400 border border-gray-700 p-3 md:p-4 rounded-xl text-xs md:text-sm italic flex items-center">
                       <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...
                     </div>
                   </div>
                 )}
                 <div ref={chatEndRef} />
               </div>

               <form onSubmit={handleOracleSubmit} className="p-3 md:p-4 bg-[#111827] border-t border-gray-800 flex shrink-0">
                 <input 
                   type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                   placeholder="Ask me anything..."
                   className="flex-1 bg-gray-800 border border-gray-700 rounded-l-lg px-3 md:px-4 py-2 md:py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                 />
                 <button type="submit" disabled={isOracleThinking || !chatInput.trim()} className="bg-purple-600 hover:bg-purple-500 text-white px-4 md:px-6 rounded-r-lg font-bold flex items-center transition-colors disabled:opacity-50">
                   <Send className="w-4 h-4 md:w-5 md:h-5" />
                 </button>
               </form>
             </div>
          )}

          {/* ================= TAB 4: TELEMETRY ================= */}
          {activeTab === 'logs' && (
             <div className="h-[calc(100vh-160px)] md:h-[80vh] flex flex-col fade-in max-w-5xl mx-auto">
               <h2 className="text-xl md:text-2xl font-bold text-white mb-4 flex items-center shrink-0">
                 <TerminalSquare className="mr-3 text-gray-400" /> Live Telemetry Stream
               </h2>
               <div className="flex-1 bg-[#111827] border border-gray-800 rounded-xl p-4 md:p-6 font-mono text-xs md:text-sm overflow-y-auto shadow-inner">
                 {cloudLogs.length === 0 ? (
                   <div className="text-gray-600 flex items-center"><Loader2 className="w-4 h-4 mr-2 animate-spin"/> Monitoring for events...</div>
                 ) : (
                   cloudLogs.map((log) => (
                     <div key={log.id} className={`mb-2 pb-2 border-b border-gray-800/50 break-words ${log.message.includes('❌') || log.message.includes('ERROR') ? 'text-red-400' : 'text-gray-300'}`}>
                       <span className="text-gray-600 mr-2 block md:inline md:mr-3">[{new Date(log.created_at).toLocaleTimeString()}]</span>
                       {log.message}
                     </div>
                   ))
                 )}
               </div>
             </div>
          )}
        </main>

        {/* MOBILE BOTTOM NAVIGATION */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#111827] border-t border-gray-800 flex justify-around items-center p-2 z-50 shadow-[0_-4px_10px_rgba(0,0,0,0.3)]">
          <button onClick={() => setActiveTab('analytics')} className={`flex flex-col items-center p-2 rounded-lg transition-colors ${activeTab === 'analytics' ? 'text-emerald-400' : 'text-gray-500 hover:text-gray-300'}`}>
            <Activity className="h-6 w-6 mb-1" />
            <span className="text-[10px] font-bold">Center</span>
          </button>
          <button onClick={() => setActiveTab('engine')} className={`flex flex-col items-center p-2 rounded-lg transition-colors ${activeTab === 'engine' ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}>
            <Cpu className="h-6 w-6 mb-1" />
            <span className="text-[10px] font-bold">Engine</span>
          </button>
          <button onClick={() => setActiveTab('oracle')} className={`flex flex-col items-center p-2 rounded-lg transition-colors ${activeTab === 'oracle' ? 'text-purple-400' : 'text-gray-500 hover:text-gray-300'}`}>
            <Bot className="h-6 w-6 mb-1" />
            <span className="text-[10px] font-bold">Oracle</span>
          </button>
          <button onClick={() => setActiveTab('logs')} className={`flex flex-col items-center p-2 rounded-lg transition-colors ${activeTab === 'logs' ? 'text-gray-200' : 'text-gray-500 hover:text-gray-300'}`}>
            <TerminalSquare className="h-6 w-6 mb-1" />
            <span className="text-[10px] font-bold">Logs</span>
          </button>
        </nav>

      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable Sub-Component for the Grid (Lives at the bottom of App.jsx)
// ---------------------------------------------------------------------------
function MetricCard({ title, value, icon, trend }) {
  return (
    <div className="bg-[#1F2937] border border-gray-800 rounded-xl p-4 md:p-5 shadow-lg flex flex-col justify-between transform transition-all duration-300 hover:-translate-y-1 hover:border-gray-700">
      <div className="flex justify-between items-start">
        <h3 className="text-gray-400 font-bold text-xs md:text-sm tracking-wide">{title}</h3>
        <div className="h-5 w-5 shrink-0">{icon}</div>
      </div>
      
      <div className="mt-3 md:mt-4 flex items-end justify-between">
        <span className="text-2xl md:text-3xl font-black text-white">{value}</span>
        
        {trend !== undefined && (
          <div className={`flex items-center text-xs md:text-sm font-bold ${trend >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
            {trend >= 0 ? <TrendingUp className="w-3 h-3 md:w-4 md:h-4 mr-1" /> : <TrendingDown className="w-3 h-3 md:w-4 md:h-4 mr-1" />}
            {Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </div>
    </div>
  );
}