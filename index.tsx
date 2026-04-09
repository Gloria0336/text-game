import React from 'react';
import ReactDOM from 'react-dom/client';
import StoryTheaterApp from './StoryTheaterApp';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <StoryTheaterApp />
  </React.StrictMode>
);
