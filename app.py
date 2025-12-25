from flask import Flask, request, jsonify, send_from_directory, render_template
from flask_cors import CORS
#from flask_talisman import Talisman
from dotenv import load_dotenv
from datetime import datetime
import psycopg2
import jwt
from jwt import PyJWKClient
from psycopg2.extras import RealDictCursor
import os
from functools import wraps


# Load environment variables
load_dotenv()

if not os.environ.get("CLERK_SECRET_KEY"):
    raise RuntimeError("CLERK_SECRET_KEY environment variable not set")

if not os.environ.get("DATABASE_URL"):
    raise RuntimeError("DATABASE_URL environment variable not set")

if not os.environ.get("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"):
    raise RuntimeError("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY environment variable not set")



app = Flask(__name__, static_folder='static', template_folder='templates')
application = app
CORS(app)



csp = {
    "default-src": ["'self'"],
    "script-src": [
        "'self'",
        "'unsafe-eval'",
        "'unsafe-inline'",
        "https://js.clerk.dev",
        "https://clerk.com",
        "https://cdn.jsdelivr.net",
        "https://cdn.chartjs.org",
        "https://challenges.cloudflare.com"
    ],
    "style-src": [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com"
    ],
    "font-src": [
        "'self'",
        "https://fonts.gstatic.com"
    ],
    "connect-src": [
        "'self'",
        "https://clerk.com",
        "https://*.clerk.com",
        "https://*.clerk.accounts.dev",
        "https://*.sentry.io",
        "https://main.clerk.com",
        "https://cdn.jsdelivr.net"
    ],
    "frame-src": [
        "https://clerk.com",
        "https://*.clerk.com",
        "https://*.clerk.accounts.dev",
        "https://challenges.cloudflare.com"
    ],
    "worker-src": ["'self'", "blob:"],
    "img-src": ["'self'", "data:", "https://img.clerk.com", "https://*.clerk.com"]
}
CORS(app)
# Talisman(app, content_security_policy=csp)

CLERK_ISSUER = "https://sweet-jackal-31.clerk.accounts.dev"
CLERK_JWKS_URL = f"{CLERK_ISSUER}/.well-known/jwks.json"

jwks_client = PyJWKClient(CLERK_JWKS_URL)


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
    auth_header = request.headers.get("Authorization")

    if not auth_header or not auth_header.startswith("Bearer "):
       # print("❌ Missing Authorization header")
        return None

    token = auth_header.split(" ")[1]

    try:
        signing_key = jwks_client.get_signing_key_from_jwt(token)

        decoded = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=CLERK_ISSUER,
            options={
                "verify_aud": False,  # Clerk frontend tokens do not need aud
            },
        )

        user_id = decoded.get("sub")
        print("✅ Authenticated user:", user_id)
        return user_id

    except jwt.ExpiredSignatureError:
        print("❌ Token expired")
        return None
    except jwt.InvalidTokenError as e:
        print("❌ Invalid token:", str(e))
        return None

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
    return render_template('index.html', clerk_publishable_key=os.environ.get("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"))

@app.route('/login')
def login():
    return render_template('auth.html', mode='login', clerk_publishable_key=os.environ.get("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"))

@app.route('/signup')
def signup():
    return render_template('auth.html', mode='signup', clerk_publishable_key=os.environ.get("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"))

@app.route('/.well-known/appspecific/com.chrome.devtools.json')
def chrome_devtools_probe():
    return jsonify({})

@app.route('/favicon.ico')
def favicon():
    return send_from_directory(app.static_folder, 'favicon.ico', mimetype='image/vnd.microsoft.icon')

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
            cur.execute("SELECT * FROM categories WHERE user_id = %s ORDER BY name", (user_id,))
            return jsonify(cur.fetchall()), 200

        data = request.get_json()
        name = data.get('name')

        if not name:
            return jsonify({'error': 'Category name required'}), 400

        cur.execute(
            "INSERT INTO categories (name, user_id) VALUES (%s, %s) RETURNING category_id",
            (name, user_id)
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
    user_id = request.user_id
    conn = db()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    try:
        if request.method == 'GET':
            cur.execute("""
                SELECT e.expense_id, e.amount, e.expense_date, e.description,
                       c.name AS category
                FROM expenses e
                JOIN categories c ON e.category_id = c.category_id
                WHERE e.user_id = %s
                ORDER BY e.expense_date DESC
            """, (user_id,))
            return jsonify(cur.fetchall()), 200

        data = request.get_json()

        cur.execute("""
            INSERT INTO expenses (user_id, category_id, amount, expense_date, description)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING expense_id
        """, (
            user_id,
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
                WHERE b.user_id = %s
            """, (user_id,))
            return jsonify(cur.fetchall()), 200

        data = request.get_json()

        cur.execute("""
            INSERT INTO budgets (user_id, category_id, month, year, budget_amount, reminder_message)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING budget_id
        """, (
            user_id,
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
              AND user_id = %s
        """, (month, year, user_id))
        monthly = cur.fetchone()

        # Category-wise totals
        cur.execute("""
            SELECT c.name AS category, SUM(e.amount) AS total
            FROM expenses e
            JOIN categories c ON e.category_id = c.category_id
            WHERE e.user_id = %s
            GROUP BY c.name
        """, (user_id,))
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
                AND e.user_id = b.user_id
            WHERE b.month = %s AND b.year = %s AND b.user_id = %s
            GROUP BY c.name, b.budget_amount, b.month, b.year
        """, (month, year, user_id))
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
