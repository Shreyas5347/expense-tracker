
from flask import Flask, request, jsonify, send_from_directory, render_template
from flask_cors import CORS
from dotenv import load_dotenv
load_dotenv()

import mysql.connector
from datetime import datetime
import os

app = Flask(__name__, static_folder='static', template_folder='templates')
application = app
CORS(app)  # allow frontend to talk to backend

def db():
    return mysql.connector.connect(
    host=os.getenv("DB_HOST"),
    port=int(os.getenv("DB_PORT")),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    database=os.getenv("DB_DATABASE")
)
try:
    test_conn = db()
    test_conn.close()
    print("✅ MySQL connected successfully")
except Exception as e:
    print("❌ MySQL connection failed:", e)

@app.route('/')
def home():
    return render_template('index.html')

# Serve static files (CSS/JS)
@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory(app.static_folder, filename)




@app.route('/categories', methods=['GET', 'POST'])
def categories():
    conn = db()
    cur = conn.cursor(dictionary=True)

    try:
        # GET → list categories
        if request.method == 'GET':
            try:
                cur.execute("SELECT * FROM categories")
                rows = cur.fetchall()
                return jsonify(rows), 200
            except mysql.connector.Error as err:
                return jsonify({'error': str(err)}), 500

        # POST → add new category
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid or missing JSON body'}), 400

        name = data.get('name')
        if not name:
            return jsonify({'error': 'Category name is required'}), 400

        try:
            cur.execute("INSERT INTO categories (name) VALUES (%s)", (name,))
            conn.commit()
            return jsonify({'id': cur.lastrowid, 'name': name}), 201
        except mysql.connector.Error as err:
            return jsonify({'error': str(err)}), 500

    finally:
        # always close cursor and connection
        try:
            cur.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass


@app.route('/expenses', methods=['GET', 'POST'])
def expenses():
    conn = db()
    cur = conn.cursor(dictionary=True)

    try:
        if request.method == 'GET':
            # Optional month and year filtering
            month = request.args.get('month')
            year = request.args.get('year')

            query = """
                SELECT e.id, e.amount, e.expense_date, e.description, c.name AS category
                FROM expenses e
                LEFT JOIN categories c ON e.category_id = c.id
            """
            params = []

            # NOTE: Using MONTH()/YEAR() is convenient but can be slower on large tables.
            # If you expect large data sets, convert to a date-range filter instead.
            if month and year:
                try:
                    month_i = int(month)
                    year_i = int(year)
                except ValueError:
                    return jsonify({'error': 'Invalid month/year value'}), 400
                query += " WHERE MONTH(e.expense_date) = %s AND YEAR(e.expense_date) = %s"
                params.extend([month_i, year_i])
            elif month:
                try:
                    month_i = int(month)
                except ValueError:
                    return jsonify({'error': 'Invalid month value'}), 400
                query += " WHERE MONTH(e.expense_date) = %s"
                params.append(month_i)
            elif year:
                try:
                    year_i = int(year)
                except ValueError:
                    return jsonify({'error': 'Invalid year value'}), 400
                query += " WHERE YEAR(e.expense_date) = %s"
                params.append(year_i)

            query += " ORDER BY e.expense_date DESC"
            cur.execute(query, params)
            rows = cur.fetchall()
            return jsonify(rows), 200

        # POST → add new expense
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid or missing JSON body'}), 400

        required_fields = ['category_id', 'amount', 'expense_date']
        if not all(field in data for field in required_fields):
            return jsonify({'error': 'Missing required fields'}), 400

        # Validate types / formats
        try:
            category_id = int(data['category_id'])
            amount = float(data['amount'])
            # ensure expense_date is a valid date string (e.g., "YYYY-MM-DD")
            expense_date = data['expense_date']
            # try parsing; adjust format if you expect "YYYY-MM-DD HH:MM:SS" etc.
            datetime.strptime(expense_date, "%Y-%m-%d")
        except ValueError:
            return jsonify({'error': 'Invalid field types or date format. Use YYYY-MM-DD'}), 400

        description = data.get('description', '')

        cur.execute(
            "INSERT INTO expenses (category_id, amount, expense_date, description) VALUES (%s,%s,%s,%s)",
            (category_id, amount, expense_date, description)
        )
        conn.commit()
        return jsonify({'id': cur.lastrowid}), 201

    except mysql.connector.Error as err:
        # Log err in real app
        return jsonify({'error': str(err)}), 500
    finally:
        try:
            cur.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass

@app.route('/budgets', methods=['GET', 'POST'])
def budgets():
    conn = db()
    cur = conn.cursor(dictionary=True)

    try:
        # GET → list budgets
        if request.method == 'GET':
            try:
                cur.execute("""
                    SELECT b.id, b.monthly_budget, b.reminder_message, c.name AS category
                    FROM budgets b
                    LEFT JOIN categories c ON b.category_id = c.id
                """)
                return jsonify(cur.fetchall()), 200
            except mysql.connector.Error as err:
                return jsonify({'error': str(err)}), 500

        # POST → add new budget
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid or missing JSON body'}), 400

        required_fields = ['category_id', 'monthly_budget']
        if not all(field in data for field in required_fields):
            return jsonify({'error': 'Missing required fields'}), 400

        try:
            # validate numeric types
            category_id = int(data['category_id'])
            monthly_budget = float(data['monthly_budget'])
        except (ValueError, TypeError):
            return jsonify({'error': 'Invalid types for category_id or monthly_budget'}), 400

        try:
            cur.execute(
                "INSERT INTO budgets (category_id, monthly_budget, reminder_message) VALUES (%s,%s,%s)",
                (category_id, monthly_budget, data.get('reminder_message', ''))
            )
            conn.commit()
            return jsonify({'id': cur.lastrowid}), 201
        except mysql.connector.Error as err:
            return jsonify({'error': str(err)}), 500

    finally:
        try:
            cur.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass


@app.route('/summary', methods=['GET'])
def summary():
    conn = db()
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
        try:
            cur.close()
        except:
            pass
        try:
            conn.close()
        except:
            pass

if __name__ == '__main__':
    app.run(debug=True)
else:
    # This is for Vercel serverless deployment
    application = app