
import os
import math
import sqlite3
from pathlib import Path
from contextlib import contextmanager
from functools import wraps

from flask import Flask, render_template, request, jsonify, session
from werkzeug.security import generate_password_hash, check_password_hash


app = Flask(__name__)

app.secret_key = os.environ.get(
    "SECRET_KEY",
    "change-this-secret-key-before-production"
)

app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("COOKIE_SECURE", "false").lower() == "true",
    PERMANENT_SESSION_LIFETIME=60 * 60 * 24 * 7
)

DB_PATH = Path(__file__).resolve().with_name("wattwise.db")

DEFAULT_APPLIANCES = [
    ("Air Conditioner", 1000, 6),
    ("Refrigerator", 200, 6),
    ("Television", 100, 5),
    ("Electric Fan", 60, 8),
]


@contextmanager
def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")

    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name TEXT NOT NULL,
                email TEXT NOT NULL COLLATE NOCASE UNIQUE,
                username TEXT NOT NULL COLLATE NOCASE UNIQUE,
                password_hash TEXT NOT NULL,
                household_name TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Preserve existing appliance records by adding user ownership.
        appliance_columns = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(appliances)").fetchall()
        }

        if not appliance_columns:
            conn.execute("""
                CREATE TABLE appliances (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    name TEXT NOT NULL,
                    watts REAL NOT NULL,
                    hours REAL NOT NULL
                )
            """)
        elif "user_id" not in appliance_columns:
            conn.execute("""
                ALTER TABLE appliances
                ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
            """)

        # Upgrade the old single-household settings table.
        settings_exists = conn.execute("""
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='settings'
        """).fetchone()

        if settings_exists:
            settings_columns = {
                row["name"]
                for row in conn.execute("PRAGMA table_info(settings)").fetchall()
            }

            if "user_id" not in settings_columns:
                legacy_exists = conn.execute("""
                    SELECT name FROM sqlite_master
                    WHERE type='table' AND name='settings_legacy'
                """).fetchone()

                if not legacy_exists:
                    conn.execute("ALTER TABLE settings RENAME TO settings_legacy")
                else:
                    conn.execute("DROP TABLE settings")
        else:
            pass

        conn.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL UNIQUE
                    REFERENCES users(id) ON DELETE CASCADE,
                rate REAL NOT NULL DEFAULT 12,
                budget REAL NOT NULL DEFAULT 3000
            )
        """)

        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_appliances_user
            ON appliances(user_id)
        """)

        conn.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
            ON users(email)
        """)

        conn.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username
            ON users(username)
        """)


# Create or upgrade the database when Flask/Gunicorn starts.
init_db()


def current_user_id():
    return session.get("user_id")


def login_required(function):
    @wraps(function)
    def wrapper(*args, **kwargs):
        if not current_user_id():
            return jsonify(error="Please log in to continue."), 401
        return function(*args, **kwargs)
    return wrapper


def current_user():
    user_id = current_user_id()

    if not user_id:
        return None

    with db() as conn:
        user = conn.execute("""
            SELECT id, full_name, email, username, household_name
            FROM users WHERE id=?
        """, (user_id,)).fetchone()

    return dict(user) if user else None


def create_household_data(conn, user_id, use_legacy=False):
    """Create separate settings and appliance records for a new user."""

    rate = 12
    budget = 3000

    if use_legacy:
        legacy_table = conn.execute("""
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='settings_legacy'
        """).fetchone()

        if legacy_table:
            old_settings = conn.execute("""
                SELECT rate, budget FROM settings_legacy LIMIT 1
            """).fetchone()

            if old_settings:
                rate = old_settings["rate"]
                budget = old_settings["budget"]

            # Give the first account ownership of old appliance records.
            conn.execute("""
                UPDATE appliances SET user_id=?
                WHERE user_id IS NULL
            """, (user_id,))

    conn.execute("""
        INSERT INTO settings (user_id, rate, budget)
        VALUES (?, ?, ?)
    """, (user_id, rate, budget))

    count = conn.execute("""
        SELECT COUNT(*) FROM appliances WHERE user_id=?
    """, (user_id,)).fetchone()[0]

    if count == 0:
        conn.executemany("""
            INSERT INTO appliances (user_id, name, watts, hours)
            VALUES (?, ?, ?, ?)
        """, [
            (user_id, name, watts, hours)
            for name, watts, hours in DEFAULT_APPLIANCES
        ])


def get_data():
    user_id = current_user_id()

    with db() as conn:
        rows = conn.execute("""
            SELECT * FROM appliances
            WHERE user_id=?
        """, (user_id,)).fetchall()

        settings = conn.execute("""
            SELECT rate, budget FROM settings
            WHERE user_id=?
        """, (user_id,)).fetchone()

    if not settings:
        return {
            "appliances": [],
            "rate": 12,
            "budget": 3000,
            "total_kwh": 0,
            "total_cost": 0,
            "remaining": 3000,
            "count": 0
        }

    appliances = []

    for row in rows:
        daily = (row["watts"] * row["hours"]) / 1000
        monthly = daily * 30

        appliances.append({
            "id": row["id"],
            "name": row["name"],
            "watts": row["watts"],
            "hours": row["hours"],
            "daily_kwh": daily,
            "monthly_kwh": monthly,
            "monthly_cost": monthly * settings["rate"]
        })

    appliances.sort(
        key=lambda item: item["monthly_kwh"],
        reverse=True
    )

    total_kwh = sum(item["monthly_kwh"] for item in appliances)
    total_cost = total_kwh * settings["rate"]

    return {
        "appliances": appliances,
        "rate": settings["rate"],
        "budget": settings["budget"],
        "total_kwh": total_kwh,
        "total_cost": total_cost,
        "remaining": settings["budget"] - total_cost,
        "count": len(appliances)
    }


def valid_number(value):
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None


# -------------------------
# ACCOUNT ROUTES
# -------------------------

@app.post("/api/signup")
def signup():
    data = request.get_json(silent=True) or {}

    full_name = str(data.get("full_name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))
    household_name = str(
        data.get("household_name") or full_name + " Household"
    ).strip()

    if not full_name or not email or not username or not password:
        return jsonify(error="Please complete all required fields."), 400

    if len(full_name) > 100 or len(household_name) > 100:
        return jsonify(error="Names must not exceed 100 characters."), 400

    if len(username) < 3 or len(username) > 30:
        return jsonify(error="Username must be 3 to 30 characters."), 400

    if not username.replace("_", "").replace(".", "").isalnum():
        return jsonify(error="Username can contain letters, numbers, dots, and underscores."), 400

    if "@" not in email or len(email) > 150:
        return jsonify(error="Please enter a valid email address."), 400

    if len(password) < 8:
        return jsonify(error="Password must contain at least 8 characters."), 400

    password_hash = generate_password_hash(password)

    try:
        with db() as conn:
            existing_users = conn.execute(
                "SELECT COUNT(*) FROM users"
            ).fetchone()[0]

            cursor = conn.execute("""
                INSERT INTO users (
                    full_name, email, username,
                    password_hash, household_name
                )
                VALUES (?, ?, ?, ?, ?)
            """, (
                full_name,
                email,
                username,
                password_hash,
                household_name
            ))

            user_id = cursor.lastrowid

            create_household_data(
                conn,
                user_id,
                use_legacy=(existing_users == 0)
            )

        session.clear()
        session["user_id"] = user_id
        session.permanent = True

        return jsonify(
            message="Your WattWise account has been created.",
            user=current_user()
        ), 201

    except sqlite3.IntegrityError:
        return jsonify(
            error="That email address or username is already registered."
        ), 409


@app.post("/api/login")
def login():
    data = request.get_json(silent=True) or {}

    identity = str(data.get("identity", "")).strip()
    password = str(data.get("password", ""))

    if not identity or not password:
        return jsonify(error="Enter your email or username and password."), 400

    with db() as conn:
        user = conn.execute("""
            SELECT * FROM users
            WHERE email=? OR username=?
        """, (identity, identity)).fetchone()

    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify(error="Incorrect email/username or password."), 401

    session.clear()
    session["user_id"] = user["id"]
    session.permanent = True

    return jsonify(
        message="Login successful.",
        user=current_user()
    )


@app.post("/api/logout")
@login_required
def logout():
    session.clear()
    return jsonify(message="You have logged out successfully.")


@app.get("/api/me")
def me():
    user = current_user()

    if not user:
        return jsonify(authenticated=False), 200

    return jsonify(authenticated=True, user=user)


# -------------------------
# DASHBOARD ROUTES
# -------------------------

@app.route("/")
def index():
    if not current_user_id():
        return render_template("login.html")
    return render_template("index.html")


@app.route("/login")
def login_page():
    if current_user_id():
        return render_template("index.html")
    return render_template("login.html")


@app.route("/signup")
def signup_page():
    if current_user_id():
        return render_template("index.html")
    return render_template("signup.html")


@app.get("/api/data")
@login_required
def api_data():
    return jsonify(get_data())


@app.post("/api/appliances")
@login_required
def add_appliance():
    data = request.get_json(silent=True) or {}

    name = str(data.get("name", "")).strip()
    watts = valid_number(data.get("watts"))
    hours = valid_number(data.get("hours"))

    if not name or len(name) > 60 or watts is None or hours is None:
        return jsonify(error="Enter a valid appliance name, wattage, and hours."), 400

    if watts <= 0 or hours < 0 or hours > 24:
        return jsonify(error="Wattage must be above 0 and hours must be from 0 to 24."), 400

    with db() as conn:
        conn.execute("""
            INSERT INTO appliances (user_id, name, watts, hours)
            VALUES (?, ?, ?, ?)
        """, (current_user_id(), name, watts, hours))

    return jsonify(get_data()), 201


@app.put("/api/appliances/<int:appliance_id>")
@login_required
def update_appliance(appliance_id):
    data = request.get_json(silent=True) or {}

    name = str(data.get("name", "")).strip()
    watts = valid_number(data.get("watts"))
    hours = valid_number(data.get("hours"))

    if not name or len(name) > 60 or watts is None or hours is None:
        return jsonify(error="Enter valid appliance details."), 400

    if watts <= 0 or hours < 0 or hours > 24:
        return jsonify(error="Check the appliance wattage and daily hours."), 400

    with db() as conn:
        cursor = conn.execute("""
            UPDATE appliances
            SET name=?, watts=?, hours=?
            WHERE id=? AND user_id=?
        """, (name, watts, hours, appliance_id, current_user_id()))

        if cursor.rowcount == 0:
            return jsonify(error="Appliance not found."), 404

    return jsonify(get_data())


@app.delete("/api/appliances/<int:appliance_id>")
@login_required
def delete_appliance(appliance_id):
    with db() as conn:
        cursor = conn.execute("""
            DELETE FROM appliances
            WHERE id=? AND user_id=?
        """, (appliance_id, current_user_id()))

        if cursor.rowcount == 0:
            return jsonify(error="Appliance not found."), 404

    return jsonify(get_data())


@app.put("/api/settings")
@login_required
def update_settings():
    data = request.get_json(silent=True) or {}

    rate = valid_number(data.get("rate"))
    budget = valid_number(data.get("budget"))

    if rate is None or budget is None:
        return jsonify(error="Enter valid rate and budget amounts."), 400

    if rate < 0 or budget < 0:
        return jsonify(error="Rate and budget cannot be negative."), 400

    with db() as conn:
        conn.execute("""
            UPDATE settings
            SET rate=?, budget=?
            WHERE user_id=?
        """, (rate, budget, current_user_id()))

    return jsonify(get_data())


@app.post("/api/what-if")
@login_required
def what_if():
    data = request.get_json(silent=True) or {}

    try:
        appliance_id = int(data.get("id"))
    except (TypeError, ValueError):
        return jsonify(error="Select a valid appliance."), 400

    new_hours = valid_number(data.get("hours"))

    if new_hours is None or new_hours < 0 or new_hours > 24:
        return jsonify(error="Hours must be between 0 and 24."), 400

    current = get_data()

    target = next(
        (
            appliance for appliance in current["appliances"]
            if appliance["id"] == appliance_id
        ),
        None
    )

    if not target:
        return jsonify(error="Appliance not found."), 404

    revised_kwh = (target["watts"] * new_hours / 1000) * 30

    revised_total_kwh = (
        current["total_kwh"]
        - target["monthly_kwh"]
        + revised_kwh
    )

    revised_cost = revised_total_kwh * current["rate"]

    return jsonify({
        "appliance": target["name"],
        "old_hours": target["hours"],
        "new_hours": new_hours,
        "current_cost": current["total_cost"],
        "projected_cost": revised_cost,
        "savings": current["total_cost"] - revised_cost,
        "projected_kwh": revised_total_kwh
    })


if __name__ == "__main__":
    app.run(debug=True)
