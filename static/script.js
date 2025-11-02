const API = 'https://expense-tracker-1-06mt.onrender.com/API';
console.log("Script loaded!");

// async function addExpense(e) {
//   e.preventDefault();
  
//   const form = e.target;
//   const data = {
//       category_id: parseInt(form.category.value),
//       amount: parseFloat(form.amount.value),
//       expense_date: form.date.value,
//       description: form.description.value
//   };

//   try {
//       const res = await fetch(`${API}/expenses`, {
//           method: 'POST',
//           headers: { 'Content-Type': 'application/json' },
//           body: JSON.stringify(data)
//       });
      
//       if (!res.ok) throw new Error(await res.text());
      
//       form.reset();
//       await loadExpenses();
//       showAlert('Expense added!', 'success');
//   } catch (err) {
//       showAlert(err.message, 'error');
//   }
// }
// alert(123)
// console.log(document.getElementById('expense-form'))
// document.getElementById('expense-form').addEventListener('submit', addExpense);
  
// Utility to fetch JSON
async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const error = new Error(`HTTP ${res.status}`);
    error.response = res;
    throw error;
  }
  return res.json();
}

// Load categories into lists and selects
async function loadCategories() {
  try {
    const cats = await fetchJSON(`${API}/categories`);

    // Deduplicate by name
    const seen = new Set();
    const uniqueCats = cats.filter(c => {
      if (seen.has(c.name)) return false;
      seen.add(c.name);
      return true;
    });

    const list = document.getElementById('categories-list');
    const selExpense = document.getElementById('category');
    const selBudget = document.getElementById('budget-category');

    // Reset
    const placeholder = '<option value="" disabled selected>-- Select Category --</option>';
    list.innerHTML = '';
    selExpense.innerHTML = placeholder;
    selBudget.innerHTML = placeholder;

    // Render only uniqueCats
    uniqueCats.forEach(c => {
      const li = document.createElement('li');
      li.textContent = c.name;
      list.appendChild(li);

      const opt1 = document.createElement('option');
      opt1.value = c.id;
      opt1.textContent = c.name;
      selExpense.appendChild(opt1);

      const opt2 = opt1.cloneNode(true);
      selBudget.appendChild(opt2);
    });
  } catch (err) {
    console.error('Error loading categories:', err);
    showAlert('Failed to load categories. Please try again.', 'error');
  }
}


// Load expenses with optional filtering
async function loadExpenses(month = '', year = '') {
  try {
    let url = `${API}/expenses`;
    const params = new URLSearchParams();
    if (month) params.append('month', month);
    if (year) params.append('year', year);
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }
    
    const exps = await fetchJSON(url);
    const list = document.getElementById('expenses-list');
    list.innerHTML = '';
    
    if (exps.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No expenses found';
      list.appendChild(li);
      return;
    }
    
    exps.forEach(e => {
      const li = document.createElement('li');
      li.innerHTML = `
        <strong>${e.expense_date}</strong> • 
        ₹${e.amount} • 
        <span class="category-tag">${e.category}</span> • 
        ${e.description || ''}
      `;
      list.appendChild(li);
    });
  } catch (err) {
    console.error('Error loading expenses:', err);
    showAlert('Failed to load expenses. Please try again.', 'error');
  }
}

// Load budgets
async function loadBudgets() {
  try {
    const buds = await fetchJSON(`${API}/budgets`);
    const list = document.getElementById('budgets-list');
    list.innerHTML = '';
    
    if (buds.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No budgets set yet';
      list.appendChild(li);
      return;
    }
    console.log(buds)
    buds.forEach(b => {
      const li = document.createElement('li');
      li.innerHTML = `
        <strong>${b.category}</strong>: 
        ₹${b.monthly_budget} • 
        <em>${b.reminder_message || 'No reminder set'}</em>
      `;
      list.appendChild(li);
    });
  } catch (err) {
    console.error('Error loading budgets:', err);
    showAlert('Failed to load budgets. Please try again.', 'error');
  }
}

// Load summary data
async function loadSummary() {
  try {
    // In your loadSummary() function

    const summary = await fetchJSON(`${API}/summary`);
    const summaryContent = document.getElementById('summary-content');
    const alertsContainer = document.getElementById('budget-alerts');
    
    // Clear previous content
    summaryContent.innerHTML = '';
    alertsContainer.innerHTML = '';

    const uniqueAlerts = [...new Map(summary.budget_comparison.map(item => 
      [item.category, item])).values()];
    
    // Create summary cards
    const summaryGrid = document.createElement('div');
    summaryGrid.className = 'summary-grid';
    
    // Total expenses card
    const totalCard = document.createElement('div');
    totalCard.className = 'summary-card';
    totalCard.innerHTML = `
      <h3>Total Expenses</h3>
      <p class="big-number">₹${summary.monthly_summary.total}</p>
      <p>for ${getMonthName(summary.month)} ${summary.year}</p>
    `;
    summaryGrid.appendChild(totalCard);
    
    // Average expense card
    const avgCard = document.createElement('div');
    avgCard.className = 'summary-card';
    avgCard.innerHTML = `
      <h3>Average Expense</h3>
      <p class="big-number">₹${summary.monthly_summary.average}</p>
      <p>per transaction</p>
    `;
    summaryGrid.appendChild(avgCard);
    
    // By category card
    const byCategoryCard = document.createElement('div');
    byCategoryCard.className = 'summary-card';
    let byCategoryHTML = '<h3>By Category</h3>';
    
    if (summary.by_category.length === 0) {
      byCategoryHTML += '<p>No expenses this month</p>';
    } else {
      summary.by_category.forEach(cat => {
        byCategoryHTML += `
          <p><strong>${cat.category}</strong>: ₹${cat.total}</p>
        `;
      });
    }
    
    byCategoryCard.innerHTML = byCategoryHTML;
    summaryGrid.appendChild(byCategoryCard);
    
    summaryContent.appendChild(summaryGrid);
    
    // Budget alerts
    if (summary.budget_comparison.length > 0) {
      summary.budget_comparison.forEach(budget => {
        const remaining = budget.remaining;
        const percentage = (budget.spent / budget.budget) * 100;
        
        let alertType = 'success';
        let message = '';
        
        if (remaining < 0) {
          alertType = 'danger';
          message = `You've exceeded your ${budget.category} budget by ₹${Math.abs(remaining)}!`;
        } else if (percentage > 80) {
          alertType = 'warning';
          message = `You've used ${percentage}% of your ${budget.category} budget.`;
        } else if (budget.spent > 0) {
          message = `You have ₹${remaining} remaining in your ${budget.category} budget.`;
        } else {
          message = `You haven't spent anything from your ${budget.category} budget yet.`;
        }
        
        if (message) {
          const alertDiv = document.createElement('div');
          alertDiv.className = `alert alert-${alertType}`;
          alertDiv.textContent = message;
          alertsContainer.appendChild(alertDiv);
        }
      });
    }
  } catch (err) {
    console.error('Error loading summary:', err);
    document.getElementById('summary-content').innerHTML = 
      '<p>Failed to load summary data. Please try again.</p>';
  }
}

// Helper function to get month name
function getMonthName(monthNumber) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[monthNumber - 1] || '';
}

// Show alert message
function showAlert(message, type = 'info') {
  const alertDiv = document.createElement('div');
  alertDiv.className = `alert alert-${type}`;
  alertDiv.textContent = message;
  
  // Add to top of container
  const container = document.querySelector('.container');
  container.insertBefore(alertDiv, container.firstChild);
  
  // Remove after 5 seconds
  setTimeout(() => {
    alertDiv.remove();
  }, 5000);
}

// Handlers
document.getElementById('category-form').addEventListener('submit', async e => {
  e.preventDefault();
  const name = document.getElementById('new-category').value.trim();
  if (!name) {
    showAlert('Category name cannot be empty.', 'warning');
    return;
  }
  
  try {
    await fetchJSON(`${API}/categories`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({name})
    });
    e.target.reset();
    await loadCategories();
    showAlert('Category added successfully!', 'success');
  } catch (err) {
    console.error(err);
    const errorMsg = err.response?.status === 409 ? 
      'Category already exists' : 'Error adding category';
    showAlert(errorMsg, 'error');
  }
});

document.getElementById('expense-form').addEventListener('submit', async e => {
  e.preventDefault();
  const categoryRaw = document.getElementById('category').value;
  if (!categoryRaw) {
    showAlert('Please select a category.', 'warning');
    return;
  }
  
  const data = {
    category_id: parseInt(categoryRaw, 10),
    amount: parseFloat(document.getElementById('amount').value),
    expense_date: document.getElementById('date').value,
    description: document.getElementById('description').value.trim()
  };
  
  if (!data.amount || data.amount <= 0) {
    showAlert('Please enter a valid amount.', 'warning');
    return;
  }
  
  if (!data.expense_date) {
    showAlert('Please select a date.', 'warning');
    return;
  }
  
  try {
    await fetchJSON(`${API}/expenses`, {
      method: 'POST', 
      headers: {'Content-Type':'application/json'}, 
      body: JSON.stringify(data)
    });
    e.target.reset();
    await loadExpenses();
    await loadSummary();
    showAlert('Expense added successfully!', 'success');
  } catch (err) {
    console.error(err);
    showAlert('Error adding expense.', 'error');
  }
});

document.getElementById('budget-form').addEventListener('submit', async e => {
  e.preventDefault();
  const categoryRaw = document.getElementById('budget-category').value;
  if (!categoryRaw) {
    showAlert('Please select a category.', 'warning');
    return;
  }
  
  const data = {
    category_id: parseInt(categoryRaw, 10),
    monthly_budget: parseFloat(document.getElementById('monthly-budget').value),
    reminder_message: document.getElementById('reminder-message').value.trim()
  };
  
  if (!data.monthly_budget || data.monthly_budget <= 0) {
    showAlert('Please enter a valid budget amount.', 'warning');
    return;
  }
  
  try {
    await fetchJSON(`${API}/budgets`, {
      method: 'POST', 
      headers: {'Content-Type':'application/json'}, 
      body: JSON.stringify(data)
    });
    e.target.reset();
    await loadBudgets();
    await loadSummary();
    showAlert('Budget set successfully!', 'success');
  } catch (err) {
    console.error(err);
    showAlert('Error setting budget.', 'error');
  }
});

// Filter controls
document.getElementById('apply-filter').addEventListener('click', () => {
  const month = document.getElementById('filter-month').value;
  const year = document.getElementById('filter-year').value;
  loadExpenses(month, year);
});

document.addEventListener('DOMContentLoaded', async () => {
  // Set today's date
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('date').value = today;

  // Initial data load
  try {
    await loadCategories();
    await loadExpenses();
    await loadBudgets();
    await loadSummary();
  } catch (err) {
    console.error('Initialization error:', err);
    showAlert('Failed to load initial data.', 'error');
  }
});
