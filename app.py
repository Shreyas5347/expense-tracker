from flask import Flask, request, jsonify, send_from_directory, render_template
from flask_cors import CORS
from dotenv import load_dotenv
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor
import os
from functools import wraps
from clerk_backend_api import Clerk
clerk = Clerk(api_key=os.environ["CLERK_SECRET_KEY"])
# Load environment variables
load_dotenv()


app = Flask(__name__, static_folder='static', template_folder='templates')
application = app
CORS(app)

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user_id = get_user_id()
        if not user_id:
            return jsonify({"error": "Unauthorized"}), 401

        # attach user_id to request for later use
        request.user_id = user_id
        return f(*args, **kwargs)
    return decorated

def get_user_id(): 
    auth = request.headers.get("Authorization") 
    if not auth: 
        return None 
    token = auth.replace("Bearer ", "") 
    session = clerk.sessions.verify_session(token) 
    return session.user_id
# =========================
# DATABASE CONNECTION
# =========================


def db():
    return psycopg2.connect(
        os.environ["DATABASE_URL"],
        cursor_factory=RealDictCursor,
        sslmode="require"
    )

# Test DB connection
try:
    conn = db()
    conn.close()
    print("✅ PostgreSQL connected successfully")
except Exception as e:
    print("❌ PostgreSQL connection failed:", e)

# =========================
# HOME & STATIC
# =========================
@app.route('/')
def home():
    return render_template('index.html')

@app.route('/.well-known/appspecific/com.chrome.devtools.json')
def chrome_devtools_probe():
    return jsonify({})

@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory(app.static_folder, filename)

# =========================
# CATEGORIES
# =========================
@app.route('/categories', methods=['GET', 'POST'])
@require_auth
def categories():
    user_id = request.user_id
    conn = db()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    try:
        if request.method == 'GET':
            cur.execute("SELECT * FROM categories ORDER BY name")
            return jsonify(cur.fetchall()), 200

        data = request.get_json()
        name = data.get('name')

        if not name:
            return jsonify({'error': 'Category name required'}), 400

        cur.execute(
            "INSERT INTO categories (name) VALUES (%s) RETURNING category_id",
            (name,)
        )
        conn.commit()
        return jsonify({'id': cur.fetchone()['category_id']}), 201

    finally:
        cur.close()
        conn.close()

# =========================
# EXPENSES
# =========================
@app.route('/expenses', methods=['GET', 'POST'])
@require_auth
def expenses():
    
    conn = db()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    try:
        if request.method == 'GET':
            cur.execute("""
                SELECT e.expense_id, e.amount, e.expense_date, e.description,
                       c.name AS category
                FROM expenses e
                JOIN categories c ON e.category_id = c.category_id
                ORDER BY e.expense_date DESC
            """)
            return jsonify(cur.fetchall()), 200

        data = request.get_json()

        cur.execute("""
            INSERT INTO expenses (user_id, category_id, amount, expense_date, description)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING expense_id
        """, (
            1,  # temporary user_id
            data['category_id'],
            data['amount'],
            data['expense_date'],
            data.get('description', '')
        ))

        conn.commit()
        return jsonify({'id': cur.fetchone()['expense_id']}), 201

    finally:
        cur.close()
        conn.close()

# =========================
# BUDGETS
# =========================
@app.route('/budgets', methods=['GET', 'POST'])
@require_auth
def budgets():
    user_id = request.user_id
    conn = db()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    try:
        if request.method == 'GET':
            cur.execute("""
                SELECT b.budget_id, b.budget_amount, b.month, b.year,
                       c.name AS category
                FROM budgets b
                JOIN categories c ON b.category_id = c.category_id
            """)
            return jsonify(cur.fetchall()), 200

        data = request.get_json()

        cur.execute("""
            INSERT INTO budgets (user_id, category_id, month, year, budget_amount, reminder_message)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING budget_id
        """, (
            1,
            data['category_id'],
            data['month'],
            data['year'],
            data['budget_amount'],
            data.get('reminder_message', '')
        ))

        conn.commit()
        return jsonify({'id': cur.fetchone()['budget_id']}), 201

    finally:
        cur.close()
        conn.close()

# =========================
# SUMMARY (FOR DASHBOARD)
# =========================
@app.route('/summary')
@require_auth
def summary():
    user_id = request.user_id
    conn = db()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    now = datetime.now()

    if request.args.get('month'):
        month = int(request.args.get('month'))
    else:
        month = now.month
        
    if request.args.get('year'):
        year = int(request.args.get('year'))
    else:
        year = now.year

    try:
        # Monthly total & average
        cur.execute("""
            SELECT SUM(amount) AS total, AVG(amount) AS average
            FROM expenses
            WHERE EXTRACT(MONTH FROM expense_date) = %s
              AND EXTRACT(YEAR FROM expense_date) = %s
        """, (month, year))
        monthly = cur.fetchone()

        # Category-wise totals
        cur.execute("""
            SELECT c.name AS category, SUM(e.amount) AS total
            FROM expenses e
            JOIN categories c ON e.category_id = c.category_id
            GROUP BY c.name
        """)
        categories = cur.fetchall()

        # Budget vs actual
        cur.execute("""
            SELECT c.name AS category,
                   b.budget_amount,
                   COALESCE(SUM(e.amount), 0) AS spent
            FROM budgets b
            JOIN categories c ON b.category_id = c.category_id
            LEFT JOIN expenses e
                ON e.category_id = b.category_id
                AND EXTRACT(MONTH FROM e.expense_date) = b.month
                AND EXTRACT(YEAR FROM e.expense_date) = b.year
            WHERE b.month = %s AND b.year = %s
            GROUP BY c.name, b.budget_amount, b.month, b.year
        """, (month, year))
        budget = cur.fetchall()

        return jsonify({
            'monthly_summary': monthly,
            'by_category': categories,
            'budget_comparison': budget,
            'month': month,
            'year': year
        })

    finally:
        cur.close()
        conn.close()

# =========================
# RUN
# =========================
if __name__ == '__main__':
    app.run(debug=True)
