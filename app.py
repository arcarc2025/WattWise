from flask import Flask, render_template, request, jsonify
import sqlite3
from pathlib import Path

app = Flask(__name__)
DB_PATH = Path(__file__).with_name("wattwise.db")

def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS appliances (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                watts REAL NOT NULL,
                hours REAL NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                rate REAL NOT NULL DEFAULT 12,
                budget REAL NOT NULL DEFAULT 3000
            )
        """)
        conn.execute("INSERT OR IGNORE INTO settings (id, rate, budget) VALUES (1, 12, 3000)")
        count = conn.execute("SELECT COUNT(*) FROM appliances").fetchone()[0]
        if count == 0:
            conn.executemany(
                "INSERT INTO appliances (name, watts, hours) VALUES (?, ?, ?)",
                [
                    ("Air Conditioner", 1000, 6),
                    ("Refrigerator", 200, 6),
                    ("Television", 100, 5),
                    ("Electric Fan", 60, 8),
                ],
            )

def get_data():
    with db() as conn:
        rows = conn.execute("SELECT * FROM appliances").fetchall()
        settings = conn.execute("SELECT rate, budget FROM settings WHERE id=1").fetchone()
    appliances = []
    for row in rows:
        daily = (row["watts"] * row["hours"]) / 1000
        monthly = daily * 30
        appliances.append({
            "id": row["id"], "name": row["name"], "watts": row["watts"],
            "hours": row["hours"], "daily_kwh": daily,
            "monthly_kwh": monthly, "monthly_cost": monthly * settings["rate"]
        })
    appliances.sort(key=lambda x: x["monthly_kwh"], reverse=True)
    total_kwh = sum(a["monthly_kwh"] for a in appliances)
    total_cost = total_kwh * settings["rate"]
    return {
        "appliances": appliances, "rate": settings["rate"], "budget": settings["budget"],
        "total_kwh": total_kwh, "total_cost": total_cost,
        "remaining": settings["budget"] - total_cost,
        "count": len(appliances)
    }

@app.route("/")
def index():
    return render_template("index.html")

@app.get("/api/data")
def api_data():
    return jsonify(get_data())

@app.post("/api/appliances")
def add_appliance():
    data = request.get_json(force=True)
    name = str(data.get("name", "")).strip()
    try:
        watts, hours = float(data.get("watts")), float(data.get("hours"))
    except (TypeError, ValueError):
        return jsonify(error="Enter valid numbers for wattage and hours."), 400
    if not name or watts <= 0 or hours < 0 or hours > 24:
        return jsonify(error="Enter an appliance name, wattage above 0, and hours from 0 to 24."), 400
    with db() as conn:
        conn.execute("INSERT INTO appliances (name, watts, hours) VALUES (?, ?, ?)", (name, watts, hours))
    return jsonify(get_data()), 201

@app.put("/api/appliances/<int:appliance_id>")
def update_appliance(appliance_id):
    data = request.get_json(force=True)
    name = str(data.get("name", "")).strip()
    try:
        watts, hours = float(data.get("watts")), float(data.get("hours"))
    except (TypeError, ValueError):
        return jsonify(error="Enter valid numbers for wattage and hours."), 400
    if not name or watts <= 0 or hours < 0 or hours > 24:
        return jsonify(error="Check the appliance name, wattage, and daily hours."), 400
    with db() as conn:
        cur = conn.execute(
            "UPDATE appliances SET name=?, watts=?, hours=? WHERE id=?",
            (name, watts, hours, appliance_id)
        )
        if cur.rowcount == 0:
            return jsonify(error="Appliance not found."), 404
    return jsonify(get_data())

@app.delete("/api/appliances/<int:appliance_id>")
def delete_appliance(appliance_id):
    with db() as conn:
        conn.execute("DELETE FROM appliances WHERE id=?", (appliance_id,))
    return jsonify(get_data())

@app.put("/api/settings")
def update_settings():
    data = request.get_json(force=True)
    try:
        rate, budget = float(data.get("rate")), float(data.get("budget"))
    except (TypeError, ValueError):
        return jsonify(error="Enter valid rate and budget amounts."), 400
    if rate < 0 or budget < 0:
        return jsonify(error="Rate and budget cannot be negative."), 400
    with db() as conn:
        conn.execute("UPDATE settings SET rate=?, budget=? WHERE id=1", (rate, budget))
    return jsonify(get_data())

@app.post("/api/what-if")
def what_if():
    data = request.get_json(force=True)
    try:
        appliance_id = int(data.get("id"))
        new_hours = float(data.get("hours"))
    except (TypeError, ValueError):
        return jsonify(error="Enter a valid appliance and number of hours."), 400
    if new_hours < 0 or new_hours > 24:
        return jsonify(error="Hours must be between 0 and 24."), 400
    current = get_data()
    target = next((a for a in current["appliances"] if a["id"] == appliance_id), None)
    if not target:
        return jsonify(error="Appliance not found."), 404
    revised_kwh = (target["watts"] * new_hours / 1000) * 30
    revised_total_kwh = current["total_kwh"] - target["monthly_kwh"] + revised_kwh
    revised_cost = revised_total_kwh * current["rate"]
    return jsonify({
        "appliance": target["name"], "old_hours": target["hours"], "new_hours": new_hours,
        "current_cost": current["total_cost"], "projected_cost": revised_cost,
        "savings": current["total_cost"] - revised_cost,
        "projected_kwh": revised_total_kwh
    })

if __name__ == "__main__":
    init_db()
    app.run(debug=True)