#!/bin/bash

# Script to set environment variables and start Flask app with PM2

# Exit on any error
set -e

# Define environment variables
export FLASK_APP=api.index
export API=7263379847:AAHZaaKZNtxXqoSM_nhxz5tdNGfpUWvulnk
export CHANNEL_ID=@Pumpfun_api_bot

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "Error: PM2 is not installed. Installing PM2..."
    npm install -g pm2
    if [ $? -ne 0 ]; then
        echo "Error: Failed to install PM2. Please install it manually with 'npm install -g pm2'."
        exit 1
    fi
fi

# Check if Python3 is installed
if ! command -v python3 &> /dev/null; then
    echo "Error: Python3 is not installed. Please install Python3."
    exit 1
fi

# Check if Flask is installed
if ! python3 -c "import flask" &> /dev/null; then
    echo "Error: Flask is not installed. Installing Flask..."
    pip3 install flask
    if [ $? -ne 0 ]; then
        echo "Error: Failed to install Flask. Please install it manually with 'pip3 install flask'."
        exit 1
    fi
fi

# Stop any existing PM2 process with the same name (optional, to avoid duplicates)
pm2 delete flask-app &> /dev/null || true

# Start Flask app with PM2
echo "Starting Flask app with PM2..."
pm2 start python3 --name flask-app -- -m flask run

# Check if PM2 started successfully
if [ $? -eq 0 ]; then
    echo "Flask app started successfully with PM2."
    echo "To monitor the app, run: pm2 logs flask-app"
    echo "To stop the app, run: pm2 stop flask-app"
    echo "To restart the app, run: pm2 restart flask-app"
    echo "To delete the app from PM2, run: pm2 delete flask-app"
else
    echo "Error: Failed to start Flask app with PM2"
    exit 1
fi

# Save PM2 process list to persist across reboots
pm2 save

# Optional: Display PM2 status
pm2 status