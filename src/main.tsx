import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { OutputWindow } from './components/OutputWindow';
import './index.css';

const params = new URLSearchParams(window.location.search);
const isOutputWindow = params.get('window') === 'output';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isOutputWindow ? <OutputWindow /> : <App />}
  </React.StrictMode>,
);

