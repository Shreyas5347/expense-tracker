
const API = '';
let categoryPieChart, trendChart, categoryBarChart, budgetComparisonChart;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('date').value = today;

  await loadCategories();
  await loadExpenses();
  await loadBudgets();
  await loadSummary();
});

// Fetch helper
async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Load categories
async function loadCategories() {
  try {
    const cats = await fetchJSON(`${API}/categories`);
    const uniqueCats = [...new Map(cats.map(c => [c.name, c])).values()];

    const display = document.getElementById('categories-display');
    const select1 = document.getElementById('category');
    const select2 = document.getElementById('budget-category');

    display.innerHTML = '';
    select1.innerHTML = '<option value="">Select Category</option>';
    select2.innerHTML = '<option value="">Select Category</option>';

    uniqueCats.forEach(c => {
      const badge = document.createElement('span');
      badge.style.cssText = 'background: rgba(99,102,241,0.2); color: var(--primary); padding: 8px 16px; border-radius: 20px; font-weight: 600;';
      badge.textContent = c.name;
      display.appendChild(badge);

      const opt1 = document.createElement('option');
      opt1.value = c.id;
      opt1.textContent = c.name;
      select1.appendChild(opt1);
      select2.appendChild(opt1.cloneNode(true));
    });
  } catch (err) {
    console.error('Error loading categories:', err);
  }
}

// Load expenses
async function loadExpenses() {
  try {
    const exps = await fetchJSON(`${API}/expenses`);
    const list = document.getElementById('expenses-list');

    if (exps.length === 0) {
      list.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">No expenses yet</p>';
      return;
    }

    list.innerHTML = '';
    exps.slice(0, 10).forEach(e => {
      const item = document.createElement('div');
      item.className = 'expense-item';
      item.innerHTML = `
  <div class="expense-details">
    <span class="expense-category">${e.category}</span>
    <div class="expense-description">${e.description || 'No description'}</div>
  </div>
  <div>
    <div class="expense-amount">₹${parseFloat(e.amount).toFixed(2)}</div>
    <div class="expense-date">${e.expense_date}</div>
  </div>
  `;
      list.appendChild(item);
    });
  } catch (err) {
    console.error('Error loading expenses:', err);
  }
}

// Load budgets
async function loadBudgets() {
  try {
    const buds = await fetchJSON(`${API}/budgets`);
    const display = document.getElementById('budgets-display');

    if (buds.length === 0) {
      display.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">No budgets set yet</p>';
      return;
    }

    display.innerHTML = '';
    buds.forEach(b => {
      const item = document.createElement('div');
      item.className = 'budget-item';
      item.innerHTML = `
  <div class="budget-header">
    <span class="budget-category">${b.category}</span>
    <span class="budget-amount">₹${parseFloat(b.monthly_budget).toFixed(2)}</span>
  </div>
  ${b.reminder_message ? `<div style="color: var(--text-secondary); font-size: 0.9rem;">${b.reminder_message}</div>` : ''}
  `;
      display.appendChild(item);
    });
  } catch (err) {
    console.error('Error loading budgets:', err);
  }
}

// Load summary and update charts
async function loadSummary() {
  try {
    const summary = await fetchJSON(`${API}/summary`);

    // Update stats
    document.getElementById('total-expenses').textContent =
      `₹${(Number(summary.monthly_summary.total) || 0).toFixed(2)
      }`;
    document.getElementById('avg-expense').textContent =
      `₹${(Number(summary.monthly_summary.average) || 0).toFixed(2)
      }`;

    const totalBudget = summary.budget_comparison.reduce((sum, b) => sum + parseFloat(b.budget), 0);
    const totalSpent = summary.budget_comparison.reduce((sum, b) => sum + parseFloat(b.spent), 0);
    document.getElementById('total-budget').textContent = `₹${totalBudget.toFixed(2)}`;
    document.getElementById('budget-remaining').textContent =
      `₹${(totalBudget - totalSpent).toFixed(2)} remaining`;

    const exps = await fetchJSON(`${API}/expenses`);
    document.getElementById('transaction-count').textContent = exps.length;

    // Budget alerts
    const alertsContainer = document.getElementById('alerts-container');
    alertsContainer.innerHTML = '';

    summary.budget_comparison.forEach(budget => {
      const percentage = (budget.spent / budget.budget) * 100;
      let alertClass = 'alert-success';
      let message = '';

      if (budget.remaining < 0) {
        alertClass = 'alert-danger';
        message = `⚠️ You've exceeded your ${budget.category} budget by ₹${Math.abs(budget.remaining).toFixed(2)}!`;
      } else if (percentage > 80) {
        alertClass = 'alert-warning';
        message = `⚡ You've used ${percentage.toFixed(0)}% of your ${budget.category} budget`;
      }

      if (message) {
        const alert = document.createElement('div');
        alert.className = `alert ${alertClass}`;
        alert.textContent = message;
        alertsContainer.appendChild(alert);
      }
    });

    // Update charts
    updateCharts(summary);
  } catch (err) {
    console.error('Error loading summary:', err);
  }
}

// Update all charts
function updateCharts(summary) {
  // Check if we have data
  const hasExpenses = summary.by_category && summary.by_category.length > 0;
  const hasBudgets = summary.budget_comparison && summary.budget_comparison.length > 0;

  // Pie Chart - Expenses by Category
  if (hasExpenses) {
    const pieData = {
      labels: summary.by_category.map(c => c.category),
      datasets: [{
        data: summary.by_category.map(c => parseFloat(c.total)),
        backgroundColor: [
          '#8B5CF6', '#EC4899', '#10B981', '#F59E0B',
          '#3B82F6', '#6366F1', '#F97316', '#84cc16'
        ],
        borderWidth: 0,
        hoverOffset: 15
      }]
    };

    if (categoryPieChart) categoryPieChart.destroy();
    categoryPieChart = new Chart(document.getElementById('categoryPieChart'), {
      type: 'doughnut',
      data: pieData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#6B7280',
              padding: 20,
              font: { family: 'Poppins', size: 12 },
              usePointStyle: true,
              pointStyle: 'circle'
            }
          },
          tooltip: {
            backgroundColor: '#FFF',
            titleColor: '#1F2937',
            bodyColor: '#1F2937',
            borderColor: '#F3F4F6',
            borderWidth: 1,
            padding: 12,
            boxPadding: 4,
            usePointStyle: true,
            callbacks: {
              label: function (context) {
                return context.label + ': ₹' + context.parsed.toFixed(2);
              }
            }
          }
        }
      }
    });
  } else {
    // Show "No data" message
    const canvas = document.getElementById('categoryPieChart');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '16px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('No expense data yet', canvas.width / 2, canvas.height / 2);
  }

  // Bar Chart - Category Breakdown
  if (hasExpenses) {
    if (categoryBarChart) categoryBarChart.destroy();
    categoryBarChart = new Chart(document.getElementById('categoryBarChart'), {
      type: 'bar',
      data: {
        labels: summary.by_category.map(c => c.category),
        datasets: [{
          label: 'Amount Spent',
          data: summary.by_category.map(c => parseFloat(c.total)),
          backgroundColor: '#059669',
          borderColor: '#047857',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (context) {
                return 'Spent: ₹' + context.parsed.y.toFixed(2);
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { color: '#cbd5e1' },
            grid: { color: '#334155' }
          },
          x: {
            ticks: { color: '#cbd5e1' },
            grid: { display: false }
          }
        }
      }
    });
  }

  // Budget Comparison Chart
  if (hasBudgets) {
    const budgetData = {
      labels: summary.budget_comparison.map(b => b.category),
      datasets: [
        {
          label: 'Budget',
          data: summary.budget_comparison.map(b => parseFloat(b.budget)),
          backgroundColor: '#6366f1',
          borderColor: '#4f46e5',
          borderWidth: 1
        },
        {
          label: 'Spent',
          data: summary.budget_comparison.map(b => parseFloat(b.spent)),
          backgroundColor: '#059669',
          borderColor: '#047857',
          borderWidth: 1
        }
      ]
    };

    if (budgetComparisonChart) budgetComparisonChart.destroy();
    budgetComparisonChart = new Chart(document.getElementById('budgetComparisonChart'), {
      type: 'bar',
      data: budgetData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: '#cbd5e1', font: { size: 12 } }
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                return context.dataset.label + ': ₹' + context.parsed.y.toFixed(2);
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { color: '#cbd5e1' },
            grid: { color: '#334155' }
          },
          x: {
            ticks: { color: '#cbd5e1' },
            grid: { display: false }
          }
        }
      }
    });
  }

  // Trend Chart - Weekly spending
  if (hasExpenses) {
    // Calculate weekly totals for current month
    const weekLabels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
    const weekData = summary.by_category.length >= 4
      ? summary.by_category.slice(0, 4).map(c => parseFloat(c.total))
      : [...summary.by_category.map(c => parseFloat(c.total)), ...Array(4 - summary.by_category.length).fill(0)];

    const trendData = {
      labels: weekLabels,
      datasets: [{
        label: 'Weekly Spending',
        data: weekData,
        borderColor: '#059669',
        backgroundColor: 'rgba(5, 150, 105, 0.1)',
        fill: true,
        tension: 0.4,
        borderWidth: 2,
        pointBackgroundColor: '#059669',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 4
      }]
    };

    if (trendChart) trendChart.destroy();
    trendChart = new Chart(document.getElementById('trendChart'), {
      type: 'line',
      data: trendData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (context) {
                return 'Spent: ₹' + context.parsed.y.toFixed(2);
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { color: '#cbd5e1' },
            grid: { color: '#334155' }
          },
          x: {
            ticks: { color: '#cbd5e1' },
            grid: { display: false }
          }
        }
      }
    });
  }
}

// Form handlers
document.getElementById('category-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('new-category').value.trim();

  try {
    await fetchJSON(`${API}/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    e.target.reset();
    await loadCategories();
    showNotification('Category added successfully!', 'success');
  } catch (err) {
    showNotification('Error adding category', 'error');
  }
});

document.getElementById('expense-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const data = {
    category_id: parseInt(document.getElementById('category').value),
    amount: parseFloat(document.getElementById('amount').value),
    expense_date: document.getElementById('date').value,
    description: document.getElementById('description').value
  };

  try {
    await fetchJSON(`${API}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    e.target.reset();
    document.getElementById('date').value = new Date().toISOString().split('T')[0];
    await loadExpenses();
    await loadSummary();
    showNotification('Expense added successfully!', 'success');
  } catch (err) {
    showNotification('Error adding expense', 'error');
  }
});

document.getElementById('budget-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const data = {
    category_id: parseInt(document.getElementById('budget-category').value),
    monthly_budget: parseFloat(document.getElementById('monthly-budget').value),
    reminder_message: document.getElementById('reminder-message').value
  };

  try {
    await fetchJSON(`${API}/budgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    e.target.reset();
    await loadBudgets();
    await loadSummary();
    showNotification('Budget set successfully!', 'success');
  } catch (err) {
    showNotification('Error setting budget', 'error');
  }
});

// Show notification
function showNotification(message, type) {
  const notification = document.createElement('div');
  notification.className = `alert alert-${type}`;
  notification.textContent = message;
  notification.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 1000; animation: slideInRight 0.5s ease;';

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'fadeOut 0.5s ease';
    setTimeout(() => notification.remove(), 500);
  }, 3000);
}
