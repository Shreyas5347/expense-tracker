const API = 'https://expense-tracker-wgry.onrender.com';

let categoryPieChart, trendChart, categoryBarChart, budgetComparisonChart;

// Fetch helper
async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

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

    const summary = await fetchJSON(url);

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

    const exps = await fetchJSON(`${API}/expenses`);
    document.getElementById('transaction-count').textContent = exps.length;

    updateCharts(summary);

  } catch (err) {
    console.error('Error loading summary:', err);
  }
}

// Update charts
function updateCharts(summary) {

  // PIE – Expenses by Category
  if (categoryPieChart) categoryPieChart.destroy();
  categoryPieChart = new Chart(document.getElementById('categoryPieChart'), {
    type: 'doughnut',
    data: {
      labels: summary.by_category.map(c => c.category),
      datasets: [{
        data: summary.by_category.map(c => Number(c.total)),
        backgroundColor: [
          '#8B5CF6','#EC4899','#10B981','#F59E0B',
          '#3B82F6','#6366F1','#F97316','#84cc16'
        ]
      }]
    },
    options: { cutout: '70%' }
  });

  // BAR – Category Breakdown
  if (categoryBarChart) categoryBarChart.destroy();
  categoryBarChart = new Chart(document.getElementById('categoryBarChart'), {
    type: 'bar',
    data: {
      labels: summary.by_category.map(c => c.category),
      datasets: [{
        label: 'Amount Spent',
        data: summary.by_category.map(c => Number(c.total)),
        backgroundColor: '#059669'
      }]
    }
  });

  // BAR – Budget vs Actual
  if (budgetComparisonChart) budgetComparisonChart.destroy();
  budgetComparisonChart = new Chart(document.getElementById('budgetComparisonChart'), {
    type: 'bar',
    data: {
      labels: summary.budget_comparison.map(b => b.category),
      datasets: [
        {
          label: 'Budget',
          data: summary.budget_comparison.map(b => Number(b.budget_amount)),
          backgroundColor: '#6366f1'
        },
        {
          label: 'Spent',
          data: summary.budget_comparison.map(b => Number(b.spent)),
          backgroundColor: '#059669'
        }
      ]
    }
  });
}

// Apply filter button
document.getElementById('apply-filters')
  .addEventListener('click', loadSummary);

// Initial load
document.addEventListener('DOMContentLoaded', loadSummary);
