
from flask import Flask, request, jsonify, send_from_directory, render_template
from flask_cors import CORS
import mysql.connector
from datetime import datetime
import os

app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)  # allow frontend to talk to backend

@app.route('/')
def home():
    return render_template('index.html')

# Serve static files (CSS/JS)
@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory(app.static_folder, filename)

# Database config (adjust user/password as needed)
db_config = {
    'host': 'localhost',
    'user': 'root',
    'password': 'king',
    'database': 'expense_tracker'
}

def get_db():
    return mysql.connector.connect(**db_config)

@app.route('/categories', methods=['GET', 'POST'])
def categories():
    conn = get_db()
    cur = conn.cursor(dictionary=True)
    if request.method == 'GET':
        cur.execute("SELECT * FROM categories")
        return jsonify(cur.fetchall())
    # POST → add new category
    name = request.json.get('name')
    if not name:
        return jsonify({'error': 'Category name is required'}), 400
    try:
        cur.execute("INSERT INTO categories (name) VALUES (%s)", (name,))
        conn.commit()
        return jsonify({'id': cur.lastrowid, 'name': name}), 201
    except mysql.connector.Error as err:
        return jsonify({'error': str(err)}), 500
    finally:
        cur.close()
        conn.close()

@app.route('/expenses', methods=['GET', 'POST'])
def expenses():
    conn = get_db()
    cur = conn.cursor(dictionary=True)
    if request.method == 'GET':
        try:
            # Optional month and year filtering
            month = request.args.get('month')
            year = request.args.get('year')
            
            query = """
                SELECT e.id, e.amount, e.expense_date, e.description, c.name AS category
                FROM expenses e
                LEFT JOIN categories c ON e.category_id = c.id
            """
            params = []
            
            if month and year:
                query += " WHERE MONTH(e.expense_date) = %s AND YEAR(e.expense_date) = %s"
                params.extend([month, year])
            elif month:
                query += " WHERE MONTH(e.expense_date) = %s"
                params.append(month)
            elif year:
                query += " WHERE YEAR(e.expense_date) = %s"
                params.append(year)
                
            query += " ORDER BY e.expense_date DESC"
            
            cur.execute(query, params)
            return jsonify(cur.fetchall())
        except mysql.connector.Error as err:
            return jsonify({'error': str(err)}), 500
    
    # POST → add new expense
    data = request.json
    required_fields = ['category_id', 'amount', 'expense_date']
    if not all(field in data for field in required_fields):
        return jsonify({'error': 'Missing required fields'}), 400
    
    try:
        cur.execute(
            "INSERT INTO expenses (category_id, amount, expense_date, description) VALUES (%s,%s,%s,%s)",
            (data['category_id'], data['amount'], data['expense_date'], data.get('description', ''))
        )
        conn.commit()
        return jsonify({'id': cur.lastrowid}), 201
    except mysql.connector.Error as err:
        return jsonify({'error': str(err)}), 500
    finally:
        cur.close()
        conn.close()

@app.route('/budgets', methods=['GET', 'POST'])
def budgets():
    conn = get_db()
    cur = conn.cursor(dictionary=True)
    if request.method == 'GET':
        try:
            cur.execute("""
                SELECT b.id, b.monthly_budget, b.reminder_message, c.name AS category
                FROM budgets b
                LEFT JOIN categories c ON b.category_id = c.id
            """)
            return jsonify(cur.fetchall())
        except mysql.connector.Error as err:
            return jsonify({'error': str(err)}), 500
    
    # POST → add new budget
    data = request.json
    required_fields = ['category_id', 'monthly_budget']
    if not all(field in data for field in required_fields):
        return jsonify({'error': 'Missing required fields'}), 400
    
    try:
        cur.execute(
            "INSERT INTO budgets (category_id, monthly_budget, reminder_message) VALUES (%s,%s,%s)",
            (data['category_id'], data['monthly_budget'], data.get('reminder_message', ''))
        )
        conn.commit()
        return jsonify({'id': cur.lastrowid}), 201
    except mysql.connector.Error as err:
        return jsonify({'error': str(err)}), 500
    finally:
        cur.close()
        conn.close()

@app.route('/summary', methods=['GET'])
def summary():
    conn = get_db()
    cur = conn.cursor(dictionary=True)
    
    try:
        # Get current month and year
        now = datetime.now()
        current_month = now.month
        current_year = now.year
        
        # Total expenses this month
        cur.execute("""
            SELECT SUM(amount) AS total, AVG(amount) AS average
            FROM expenses
            WHERE MONTH(expense_date) = %s AND YEAR(expense_date) = %s
        """, (current_month, current_year))
        monthly_summary = cur.fetchone()
        
        # Expenses by category this month
        cur.execute("""
            SELECT c.name AS category, SUM(e.amount) AS total
            FROM expenses e
            JOIN categories c ON e.category_id = c.id
            WHERE MONTH(e.expense_date) = %s AND YEAR(e.expense_date) = %s
            GROUP BY c.name
        """, (current_month, current_year))
        by_category = cur.fetchall()
        
        # Budget comparison
        cur.execute("""
            SELECT c.name AS category, 
                   b.monthly_budget AS budget,
                   COALESCE(SUM(e.amount), 0) AS spent,
                   b.monthly_budget - COALESCE(SUM(e.amount), 0) AS remaining
            FROM budgets b
            JOIN categories c ON b.category_id = c.id
            LEFT JOIN expenses e ON e.category_id = b.category_id 
                AND MONTH(e.expense_date) = %s 
                AND YEAR(e.expense_date) = %s
            GROUP BY c.name, b.monthly_budget
        """, (current_month, current_year))
        budget_comparison = cur.fetchall()
        
        return jsonify({
            'monthly_summary': monthly_summary,
            'by_category': by_category,
            'budget_comparison': budget_comparison,
            'month': current_month,
            'year': current_year
        })
    except mysql.connector.Error as err:
        return jsonify({'error': str(err)}), 500
    finally:
        cur.close()
        conn.close()

if __name__ == '__main__':
    app.run(debug=True, port=5000)