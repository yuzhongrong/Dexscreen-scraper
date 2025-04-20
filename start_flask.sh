#!/bin/bash

# Script to set environment variables and start Flask app and filterPools.js with PM2

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

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "Error: npm is not installed. Please install npm."
    exit 1
fi

# Install Node.js dependencies for filterPools.js
echo "Installing Node.js dependencies..."
npm install axios level
if [ $? -ne 0 ]; then
    echo "Error: Failed to install Node.js dependencies. Please install them manually with 'npm install axios level'."
    exit 1
fi

# Stop and delete any existing PM2 processes to avoid duplicates
echo "Stopping and deleting existing PM2 processes..."
pm2 stop flask-app &> /dev/null || true
pm2 delete flask-app &> /dev/null || true
pm2 stop filter-pools &> /dev/null || true
pm2 delete filter-pools &> /dev/null || true

# Verify that filter-pools is not running
if pm2 list | grep -q "filter-pools"; then
    echo "Error: filter-pools process is still running. Attempting to force stop..."
    pm2 delete filter-pools
    if pm2 list | grep -q "filter-pools"; then
        echo "Error: Failed to stop filter-pools process. Please stop it manually with 'pm2 delete filter-pools'."
        exit 1
    fi
fi
echo "Confirmed: filter-pools process is not running."

# Start Flask app with PM2
echo "Starting Flask app with PM2..."
pm2 start python3 --name flask-app -- -m flask run

# Check if Flask app started successfully
if [ $? -eq 0 ]; then
    echo "Flask app started successfully with PM2"
else
    echo "Error: Failed to start Flask app with PM2"
    exit 1
fi

# Start filterPools.js with PM2
echo "Starting filterPools.js with PM2..."
pm2 start filterPools.js --name filter-pools

# Check if filterPools.js started successfully
if [ $? -eq 0 ]; then
    echo "filterPools.js started successfully with PM2"
else
    echo "Error: Failed to start filterPools.js with PM2"
    exit 1
fi

# Save PM2 process list to persist across reboots
pm2 save

# Set up PM2 to start on system boot
pm2 startup

# Display PM2 status
pm2 status

echo "All applications started successfully."
echo "To monitor Flask app, run: pm2 logs flask-app"
echo "To monitor filterPools.js, run: pm2 logs filter-pools"
echo "To stop both, run: pm2 stop flask-app filter-pools"
echo "To restart both, run: pm2 restart flask-app filter-pools"
echo "To delete both from PM2, run: pm2 delete flask-app filter-pools"