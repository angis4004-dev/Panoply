import { Chart, registerables } from 'chart.js';

// Register all Chart.js controllers, elements, scales, and plugins.
// This is equivalent to importing from 'chart.js/auto' and ensures
// all chart types are available throughout the application.
Chart.register(...registerables);
