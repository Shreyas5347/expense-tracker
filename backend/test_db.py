import mysql.connector

db_config = {
    'host': 'localhost',
    'user': 'root',
    'password': 'root',
    'database': 'expense_tracker1'
}

try:
    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor(dictionary=True)
    
    # Test categories query
    cursor.execute("SELECT * FROM categories")
    print("Categories:", cursor.fetchall())
    
    # Test expenses query
    cursor.execute("SELECT * FROM expenses")
    print("Expenses:", cursor.fetchall())
    
    # Test budgets query
    cursor.execute("SELECT * FROM budgets")
    print("Budgets:", cursor.fetchall())
    
    print("Database connection successful!")
    
except mysql.connector.Error as err:
    print(f"Database error: {err}")
    
finally:
    if 'conn' in locals() and conn.is_connected():
        cursor.close()
        conn.close()