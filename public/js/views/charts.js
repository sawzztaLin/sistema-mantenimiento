// Envoltura de Chart.js con estilos comunes.

export const COLORS = {
  preventivo: '#0284c7',
  correctivo: '#e11d48',
  ok: '#16a34a',
  warn: '#f59e0b',
  bad: '#dc2626',
  palette: ['#1d4ed8', '#0891b2', '#7c3aed', '#db2777', '#ea580c', '#65a30d', '#0d9488', '#9333ea', '#ca8a04', '#475569'],
};

const instances = new WeakMap();

export function chart(canvas, config) {
  if (!canvas || !window.Chart) return null;
  instances.get(canvas)?.destroy();
  const Chart = window.Chart;
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.color = '#475569';
  const c = new Chart(canvas, {
    ...config,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      ...config.options,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } },
        ...(config.options?.plugins || {}),
      },
    },
  });
  instances.set(canvas, c);
  return c;
}
