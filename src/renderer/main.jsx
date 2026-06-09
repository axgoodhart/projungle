import { render } from 'preact';
import '../styles.css'; // legacy canvas styles (global, unchanged)
import './shell.css'; // Keeper shell chrome
import { App } from './app.jsx';

render(<App />, document.getElementById('root'));
