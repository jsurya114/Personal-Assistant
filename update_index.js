const fs = require('fs');
const path = require('path');

const indexFile = path.join(__dirname, 'public', 'index.html');
let content = fs.readFileSync(indexFile, 'utf8');

const cssToInject = `
    /* Jobs Panel */
    .jobs-panel {
      position: fixed;
      top: 0; right: -400px;
      width: 400px; height: 100vh;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(20px);
      border-left: 1px solid var(--border);
      box-shadow: -10px 0 30px rgba(0,0,0,0.5);
      transition: right 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 1000;
      display: flex;
      flex-direction: column;
    }
    .jobs-panel.open { right: 0; }
    .jobs-header { padding: 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
    .jobs-header h2 { font-size: 16px; font-weight: 500; margin:0; color:var(--text); }
    .jobs-close { background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:20px; }
    .jobs-list { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
    .job-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; transition: transform 0.2s; cursor: pointer; }
    .job-card:hover { transform: translateY(-2px); border-color: rgba(59,130,246,0.5); }
    .job-title { font-size: 14px; font-weight: 600; color: var(--text); margin-bottom: 6px; }
    .job-company { font-size: 12px; color: var(--text-dim); margin-bottom: 10px; }
    .job-salary { font-size: 12px; color: var(--green); font-weight: 500; }
    
    /* Mic Button */
    .mic-btn {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-muted);
      border-radius: 50%;
      width: 38px; height: 38px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
      margin-right: 8px;
    }
    .mic-btn.listening {
      background: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.4);
      color: #f87171;
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); } 70% { box-shadow: 0 0 0 10px rgba(239,68,68,0); } 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); } }
`;

content = content.replace('</style>', cssToInject + '\n  </style>');
content = content.replace('</head>', '  <script src="/socket.io/socket.io.js"></script>\n</head>');

const jobsHtml = `
  <div class="jobs-panel" id="jobs-panel">
    <div class="jobs-header">
      <h2>💼 LinkedIn Job Matches</h2>
      <button class="jobs-close" onclick="closeJobsPanel()">×</button>
    </div>
    <div class="jobs-list" id="jobs-list">
      <div style="color:var(--text-muted); font-size:13px; text-align:center; margin-top:20px;">Fetching latest jobs...</div>
    </div>
  </div>
`;

content = content.replace('</body>', jobsHtml + '\n</body>');

content = content.replace(
  '<button id="send-btn" onclick="sendMessage()" title="Send">➤</button>',
  '<button class="mic-btn" id="mic-btn" onclick="toggleVoice()" title="Toggle Voice Mode (Iron Man)">🎤</button>\n      <button id="send-btn" onclick="sendMessage()" title="Send">➤</button>'
);

const jsLogic = `
    // ── Voice & UI Sockets (Iron Man Protocol) ──
    let voiceActive = false;
    let recognition = null;
    
    if ('webkitSpeechRecognition' in window) {
      recognition = new webkitSpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      
      recognition.onresult = function(event) {
        const transcript = event.results[event.results.length - 1][0].transcript.trim();
        if (transcript.toLowerCase().includes('ultron') || transcript.toLowerCase().includes('buddy')) {
          const command = transcript.replace(/ultron/i, '').replace(/buddy/i, '').trim();
          if (command) {
            document.getElementById('chat-input').value = command;
            sendMessage();
          }
        }
      };
      
      recognition.onend = function() {
        if (voiceActive) recognition.start();
      };
    }

    function toggleVoice() {
      if (!recognition) return alert('Voice recognition not supported in this browser.');
      voiceActive = !voiceActive;
      const btn = document.getElementById('mic-btn');
      if (voiceActive) {
        btn.classList.add('listening');
        recognition.start();
      } else {
        btn.classList.remove('listening');
        recognition.stop();
      }
    }

    function speak(text) {
      if (!voiceActive) return;
      const msg = new SpeechSynthesisUtterance(text);
      msg.text = text.replace(/[*#]/g, '');
      window.speechSynthesis.speak(msg);
    }

    const originalAddMessage = addMessage;
    addMessage = function(role, content, agent) {
      originalAddMessage(role, content, agent);
      if (role === 'buddy') speak(content);
    };

    const socket = io();
    socket.on('SHOW_JOBS_PANEL', async () => {
      document.getElementById('jobs-panel').classList.add('open');
      const list = document.getElementById('jobs-list');
      list.innerHTML = '<div style="color:var(--text-muted); font-size:13px; text-align:center; margin-top:20px;">Fetching latest jobs...</div>';
      
      try {
        const res = await fetch('/api/jobs');
        const data = await res.json();
        const jobs = data.jobs || [];
        if (!jobs || jobs.length === 0) {
           list.innerHTML = '<div style="color:var(--text-muted); font-size:13px; text-align:center; margin-top:20px;">No matches found.</div>';
           return;
        }
        list.innerHTML = jobs.map(j => \`
          <div class="job-card" onclick="window.open('\${j.url}','_blank')">
            <div class="job-title">\${j.role}</div>
            <div class="job-company">\${j.company}</div>
            <div class="job-salary">\${j.salary || 'Salary undisclosed'}</div>
          </div>
        \`).join('');
      } catch(e) {
        list.innerHTML = '<div style="color:var(--text-muted); font-size:13px; text-align:center; margin-top:20px;">Error loading jobs.</div>';
      }
    });

    function closeJobsPanel() {
      document.getElementById('jobs-panel').classList.remove('open');
    }
`;

content = content.replace('loadNews();', 'loadNews();\n' + jsLogic);

fs.writeFileSync(indexFile, content, 'utf8');
console.log('UI updated successfully!');
