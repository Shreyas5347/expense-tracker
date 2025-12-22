const API = 'https://expense-tracker-1-06mt.onrender.com';
// https://expense-tracker-1-06mt.onrender.com
let categoryPieChart, trendChart, categoryBarChart, budgetComparisonChart;

async function authFetchJSON(url, options = {}) {
  // Make sure Clerk is loaded
  await Clerk.load();

  // Get Clerk JWT token
  const token = await Clerk.session.getToken();

  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return res.json();
}




window.addEventListener("load", async () => {
  await Clerk.load();

  if (Clerk.user) {
    // ✅ UI updates
    document.getElementById("user-info").style.display = "block";
    document.getElementById("user-email").innerText =
      Clerk.user.primaryEmailAddress.emailAddress;

    // ✅ Logic / debugging
    console.log("Logged in user:", Clerk.user.id);
  } else {
    // ❌ Not logged in, redirect to login
    window.location.href = '/login';
  }
});


// Load summary with filters
async function loadSummary() {
  try {
    const month = document.getElementById('filter-month').value;
    const year = document.getElementById('filter-year').value;

    let url = `${API}/summary`;
    const params = [];
    if (month) params.push(`month=${month}`);
    if (year) params.push(`year=${year}`);
    if (params.length) url += `?${params.join('&')}`;

    const summary = await authFetchJSON(url);

    // Stats
    document.getElementById('total-expenses').textContent =
      `₹${Number(summary.monthly_summary.total || 0).toFixed(2)}`;

    document.getElementById('avg-expense').textContent =
      `₹${Number(summary.monthly_summary.average || 0).toFixed(2)}`;

    const totalBudget = summary.budget_comparison
      .reduce((sum, b) => sum + Number(b.budget_amount || 0), 0);

    const totalSpent = summary.budget_comparison
      .reduce((sum, b) => sum + Number(b.spent || 0), 0);

    document.getElementById('total-budget').textContent = `₹${totalBudget.toFixed(2)}`;
    document.getElementById('budget-remaining').textContent =
      `₹${(totalBudget - totalSpent).toFixed(2)} remaining`;

    // Render Budget Bars
    renderBudgetBars(summary.budget_comparison);

    // Charts & Expenses List
    const exps = await authFetchJSON(`${API}/expenses`);
    renderExpenses(exps); // Render list
    document.getElementById('transaction-count').textContent = exps.length;

    updateCharts(summary, exps);

  } catch (err) {
    console.error('Error loading summary:', err);
  }
}

// Update charts
// Consistent Palette
const PALETTE = [
  '#8B5CF6', '#EC4899', '#10B981', '#F59E0B',
  '#3B82F6', '#6366F1', '#F97316', '#84cc16',
  '#db2777', '#06b6d4', '#14b8a6', '#8b5cf6'
];

function getCategoryColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % PALETTE.length;
  return PALETTE[index];
}

// Update charts
// Render Budget Bars
function renderBudgetBars(budgets) {
  const container = document.getElementById('budget-status-container');
  if (!budgets || budgets.length === 0) {
    container.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">No budgets set for this month.</p>';
    return;
  }

  container.innerHTML = budgets.map(b => {
    const budget = Number(b.budget_amount);
    const spent = Number(b.spent);
    const percent = budget > 0 ? (spent / budget) * 100 : 0;

    let colorClass = 'bg-success';
    if (percent >= 100) colorClass = 'bg-danger';
    else if (percent >= 80) colorClass = 'bg-warning';

    return `
      <div class="budget-item">
        <div class="budget-header">
          <div class="budget-category">${b.category}</div>
          <div class="budget-amounts">
             <span class="spent">₹${spent.toFixed(2)}</span> / ₹${budget.toFixed(2)}
          </div>
        </div>
        <div class="progress-bar-container">
          <div class="progress-bar-fill ${colorClass}" style="width: ${Math.min(percent, 100)}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

function updateCharts(summary, expenses) {
  // Helpers
  const getColors = (items) => items.map(c => getCategoryColor(c.category || c));

  // DETERMINE ACTIVE PERIOD (for filtering expenses)
  const monthInput = document.getElementById('filter-month').value;
  const yearInput = document.getElementById('filter-year').value;

  const now = new Date();
  const currentMonth = monthInput ? parseInt(monthInput) : (now.getMonth() + 1);
  const currentYear = yearInput ? parseInt(yearInput) : now.getFullYear();

  // PROCESS DAILY DATA
  const filteredExps = expenses ? expenses.filter(e => {
    const d = new Date(e.expense_date);
    return (d.getMonth() + 1) === currentMonth && d.getFullYear() === currentYear;
  }) : [];

  // Aggregate
  const dailyMap = {};
  filteredExps.forEach(e => {
    const d = new Date(e.expense_date);
    const key = d.getDate();
    dailyMap[key] = (dailyMap[key] || 0) + Number(e.amount);
  });

  // Generate arrays
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const labels = [];
  const data = [];
  let maxVal = 0;
  let maxIndex = -1;

  for (let i = 1; i <= daysInMonth; i++) {
    const displayDate = new Date(currentYear, currentMonth - 1, i).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    labels.push(displayDate);

    const val = dailyMap[i] || 0;
    data.push(val);
    if (val > maxVal) {
      maxVal = val;
      maxIndex = i - 1;
    }
  }

  // Point Styles
  const pointRadii = data.map((_, i) => i === maxIndex && maxVal > 0 ? 6 : 0);
  const pointColors = data.map((_, i) => i === maxIndex ? '#F87171' : '#8B5CF6');
  const pointHoverRadii = data.map((_, i) => i === maxIndex ? 8 : 6);

  // PIE
  if (categoryPieChart) categoryPieChart.destroy();
  categoryPieChart = new Chart(document.getElementById('categoryPieChart'), {
    type: 'doughnut',
    data: {
      labels: summary.by_category.map(c => c.category),
      datasets: [{
        data: summary.by_category.map(c => Number(c.total)),
        backgroundColor: getColors(summary.by_category),
        borderColor: '#ffffff',
        borderWidth: 2
      }]
    },
    options: { cutout: '70%' }
  });

  // LINE (Interactive)
  if (trendChart) trendChart.destroy();
  const verticalLinePlugin = {
    id: 'verticalLine',
    afterDraw: (chart) => {
      if (chart.tooltip?._active?.length) {
        const ctx = chart.ctx;
        const x = chart.tooltip._active[0].element.x;
        const topY = chart.scales.y.top;
        const bottomY = chart.scales.y.bottom;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, topY);
        ctx.lineTo(x, bottomY);
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#E5E7EB';
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.restore();
      }
    }
  };

  trendChart = new Chart(document.getElementById('trendChart'), {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Daily Spending',
        data: data,
        borderColor: '#8B5CF6',
        backgroundColor: (context) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, 400);
          gradient.addColorStop(0, 'rgba(139, 92, 246, 0.2)');
          gradient.addColorStop(1, 'rgba(139, 92, 246, 0.0)');
          return gradient;
        },
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointRadius: pointRadii,
        pointBackgroundColor: pointColors,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointHoverRadius: pointHoverRadii,
        pointHoverBackgroundColor: '#8B5CF6',
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          titleColor: '#1F2937',
          bodyColor: '#1F2937',
          bodyFont: { size: 14, weight: 'bold' },
          borderColor: '#F3F4F6',
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          callbacks: {
            title: (items) => items[0].label,
            label: (context) => {
              const val = context.parsed.y;
              let label = `₹${val.toFixed(2)}`;
              if (context.dataIndex === maxIndex && val > 0) {
                label += ' (Highest)';
              }
              return label;
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
        y: { beginAtZero: true, grid: { color: '#F3F4F6', borderDash: [5, 5] }, ticks: { callback: (val) => '₹' + val } }
      }
    },
    plugins: [verticalLinePlugin]
  });

  // BAR Breakdown
  if (categoryBarChart) categoryBarChart.destroy();
  categoryBarChart = new Chart(document.getElementById('categoryBarChart'), {
    type: 'bar',
    data: {
      labels: summary.by_category.map(c => c.category),
      datasets: [{
        label: 'Amount Spent',
        data: summary.by_category.map(c => Number(c.total)),
        backgroundColor: getColors(summary.by_category),
        borderRadius: 8
      }]
    },
    options: { scales: { y: { beginAtZero: true } } }
  });

  // BAR Budget
  if (budgetComparisonChart) budgetComparisonChart.destroy();
  const budgetLabels = summary.budget_comparison.map(b => b.category);
  const baseColors = getColors(summary.budget_comparison);
  budgetComparisonChart = new Chart(document.getElementById('budgetComparisonChart'), {
    type: 'bar',
    data: {
      labels: budgetLabels,
      datasets: [
        {
          label: 'Budget',
          data: summary.budget_comparison.map(b => Number(b.budget_amount)),
          backgroundColor: baseColors.map(c => c + '4D'),
          borderColor: baseColors,
          borderWidth: 1,
          borderRadius: 6
        },
        {
          label: 'Spent',
          data: summary.budget_comparison.map(b => Number(b.spent)),
          backgroundColor: baseColors,
          borderRadius: 6
        }
      ]
    },
    options: { scales: { y: { beginAtZero: true } } }
  });
}

// Load categories
async function loadCategories() {
  try {
    const categories = await authFetchJSON(`${API}/categories`);

    // Dropdowns
    const expenseSelect = document.getElementById('category');
    const budgetSelect = document.getElementById('budget-category');

    expenseSelect.innerHTML = '<option value="">Select Category</option>';
    budgetSelect.innerHTML = '<option value="">Select Category</option>';

    // Display Tags
    const display = document.getElementById('categories-display');
    display.innerHTML = '';

    categories.forEach(c => {
      // Add to dropdowns
      const opt = document.createElement('option');
      opt.value = c.category_id;
      opt.textContent = c.name;
      expenseSelect.appendChild(opt.cloneNode(true));
      budgetSelect.appendChild(opt);

      // Add to display tags
      const tag = document.createElement('span');
      tag.textContent = c.name;
      display.appendChild(tag);
    });
  } catch (err) {
    console.error('Error loading categories:', err);
  }
}

// Render Expenses List
function renderExpenses(expenses) {
  const list = document.getElementById('expenses-list');
  if (expenses.length === 0) {
    list.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">No expenses yet</p>';
    return;
  }

  list.innerHTML = expenses.map(e => `
    <div class="expense-item">
      <div class="expense-details">
        <span class="expense-category">${e.category}</span>
        <div class="expense-description">${e.description || 'No description'}</div>
        <div class="expense-date">${new Date(e.expense_date).toLocaleDateString()}</div>
      </div>
      <div class="expense-amount">₹${Number(e.amount).toFixed(2)}</div>
    </div>
  `).join('');
}

// Add Category
document.getElementById('category-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nameInput = document.getElementById('new-category');
  const name = nameInput.value;

  try {
    await authFetchJSON(`${API}/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });

    nameInput.value = '';
    loadCategories(); // Refresh list
    showAlert('Category added successfully!', 'success');
  } catch (err) {
    showAlert('Failed to add category', 'danger');
  }
});

// Add Expense
document.getElementById('expense-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const data = {
    amount: document.getElementById('amount').value,
    category_id: document.getElementById('category').value,
    expense_date: document.getElementById('date').value,
    description: document.getElementById('description').value
  };

  try {
    await authFetchJSON(`${API}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    e.target.reset();
    loadSummary(); // Refresh stats
    showAlert('Expense added successfully!', 'success');
  } catch (err) {
    showAlert('Failed to add expense', 'danger');
  }
});

// Set Budget
document.getElementById('budget-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const now = new Date();
  const data = {
    category_id: document.getElementById('budget-category').value,
    budget_amount: document.getElementById('monthly-budget').value,
    reminder_message: document.getElementById('reminder-message').value,
    month: now.getMonth() + 1,
    year: now.getFullYear()
  };

  try {
    await authFetchJSON(`${API}/budgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    e.target.reset();
    loadSummary(); // Refresh stats
    showAlert('Budget set successfully!', 'success');
  } catch (err) {
    showAlert('Failed to set budget', 'danger');
  }
});

// Show Alert
function showAlert(message, type) {
  const container = document.getElementById('alerts-container');
  const alert = document.createElement('div');
  alert.className = `alert alert-${type}`;
  alert.textContent = message;

  container.appendChild(alert);

  setTimeout(() => {
    alert.style.animation = 'fadeOut 0.5s ease forwards';
    setTimeout(() => alert.remove(), 500);
  }, 3000);
}



// Apply filter button
document.getElementById('apply-filters')
  .addEventListener('click', loadSummary);

// Initial load
document.addEventListener('DOMContentLoaded', () => {
  loadCategories();
  loadSummary();
});
