# WattWise Web Application

A Flask + SQLite + HTML/CSS/JavaScript web application for household electricity consumption estimates.

## Requirements
- Python 3.9 or newer
- Flask

## Run on macOS
1. Extract the ZIP file.
2. Open Terminal and move into the `wattwise_web_app` folder:
   `cd ~/Downloads/wattwise_web_app` (adjust if you extracted it elsewhere)
3. Create a virtual environment:
   `python3 -m venv .venv`
4. Activate it:
   `source .venv/bin/activate`
5. Install Flask:
   `pip install flask`
6. Start the website:
   `python app.py`
7. Open your browser at:
   `http://127.0.0.1:5000`

The SQLite database (`wattwise.db`) is created automatically the first time the server runs.
The app starts with sample proposal data. You can add, edit, and delete appliances and change the rate and budget.

## Important
This version calculates estimates from manually entered appliance wattage and operating hours. It does not yet receive live readings from an Arduino or an energy meter. Actual hardware integration requires a compatible meter/sensor and a communication method such as serial or Wi-Fi. Do not connect household mains voltage directly to an Arduino or breadboard.