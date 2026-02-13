(function () {
  const socket = io();

  let chart = null;
  let chartRange = '1h'; // default
  let fullHistory = [];

  const rangeButtons = document.querySelectorAll('.range-btn');
  rangeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      chartRange = btn.getAttribute('data-range');
      updateChart();
    });
  });

  function getRangeMs() {
    const hour = 60 * 60 * 1000;
    const day = 24 * hour;
    const month = 30 * day;
    const year = 365 * day;
    switch (chartRange) {
      case '1h': return hour;
      case '1d': return day;
      case '1m': return month;
      case '1y': return year;
      default: return day;
    }
  }

  function updateChart() {
    const canvas = document.getElementById('price-chart');
    if (!canvas || !fullHistory.length) return;

    const ctx = canvas.getContext('2d');
    const now = Date.now();
    const rangeMs = getRangeMs();

    const filtered = fullHistory.filter(p => now - p.t <= rangeMs);

    const labels = filtered.map(p => new Date(p.t).toLocaleTimeString());
    const data = filtered.map(p => p.p);

    if (!chart) {
      chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'NR Silver Price',
            data,
            borderColor: '#66fcf1',
            backgroundColor: 'rgba(102, 252, 241, 0.1)',
            tension: 0.2,
            pointRadius: 0
          }]
        },
        options: {
          responsive: true,
          scales: {
            x: {
              ticks: { color: '#c5c6c7' }
            },
            y: {
              ticks: { color: '#c5c6c7' }
            }
          },
          plugins: {
            legend: {
              labels: { color: '#c5c6c7' }
            }
          }
        }
      });
    } else {
      chart.data.labels = labels;
      chart.data.datasets[0].data = data;
      chart.update();
    }
  }

  function updateCommon(state) {
    const priceEl = document.getElementById('current-price');
    if (priceEl) {
      priceEl.textContent = `$${state.price.toFixed(2)}`;
    }

    const totalUnitsEl = document.getElementById('total-units');
    if (totalUnitsEl) {
      totalUnitsEl.textContent = state.totalUnits;
    }

    const marketCapEl = document.getElementById('market-cap');
    if (marketCapEl) {
      marketCapEl.textContent = `$${state.marketCap.toFixed(2)}`;
    }

    fullHistory = state.priceHistory || [];
    updateChart();
  }

  function updateUserView(state) {
    const body = document.body;
    const username = body.getAttribute('data-username');
    if (!username) return;

    const userData = state.users.find(u => u.username === username);
    if (!userData) return;

    const unitsEl = document.getElementById('user-units');
    const totalValueEl = document.getElementById('user-total-value');

    if (unitsEl) unitsEl.textContent = userData.units;
    if (totalValueEl) totalValueEl.textContent = `$${userData.value.toFixed(2)}`;
  }

  function updateAdminCapTable(state) {
    const table = document.getElementById('cap-table');
    if (!table) return;

    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    tbody.innerHTML = state.users.map(u => `
      <tr data-user-id="${u.id}">
        <td>${u.username}</td>
        <td class="cap-units">${u.units}</td>
        <td class="cap-value">$${u.value.toFixed(2)}</td>
        <td class="cap-percent">${u.percent.toFixed(2)}%</td>
        <td>
          <form method="POST" action="/admin/users/${u.id}/add" style="display:inline;">
            <input type="number" name="amountUnits" min="1" step="1" placeholder="Units" required />
            <button type="submit">Add</button>
          </form>
          <form method="POST" action="/admin/users/${u.id}/subtract" style="display:inline;">
            <input type="number" name="amountUnits" min="1" step="1" placeholder="Units" required />
            <button type="submit">Subtract</button>
          </form>
        </td>
      </tr>
    `).join('');
  }

  socket.on('stateUpdate', (state) => {
    updateCommon(state);
    updateUserView(state);
    updateAdminCapTable(state);
  });
})();
