import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

function mount(){
  createRoot(document.getElementById('root')).render(<App />);
}

if (window.GrokBall){
  mount();
} else {
  const s = document.createElement('script');
  s.src = '/grok-ball.js';
  s.onload = mount;
  s.onerror = mount; // 引擎加载失败也要能渲染页面（表情区将保持空白）
  document.head.appendChild(s);
}
