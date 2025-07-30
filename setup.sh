#!/bin/bash

# Chatbot Widget with OpenAI Assistants - Setup Script
# This script helps you set up the chatbot widget with OpenAI integration

set -e

echo "🤖 Chatbot Widget with OpenAI Assistants - Setup"
echo "=================================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    echo "   Please upgrade Node.js: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"
echo ""

echo "📦 Installing backend dependencies..."
npm install

echo ""
echo "⚙️ Setting up environment configuration..."

# Check if .env already exists
if [ -f ".env" ]; then
    echo "⚠️  .env file already exists. Backing up to .env.backup"
    cp .env .env.backup
fi

# Copy example environment file
cp .env.example .env

echo "✅ Environment file created at ./.env"
echo ""

echo "🔑 IMPORTANT: You need to configure your OpenAI credentials"
echo "   1. Get your OpenAI API key from: https://platform.openai.com/api-keys"
echo "   2. Create an OpenAI Assistant at: https://platform.openai.com/assistants"
echo "   3. Edit ./.env and add your credentials:"
echo ""
echo "      OPENAI_API_KEY=your_api_key_here"
echo "      OPENAI_ASSISTANT_ID=your_assistant_id_here"
echo ""

# Ask if user wants to open the .env file
read -p "Would you like to edit the .env file now? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Try to open with common editors
    if command -v code &> /dev/null; then
        echo "Opening .env in VS Code..."
        code .env
    elif command -v nano &> /dev/null; then
        echo "Opening .env in nano..."
        nano .env
    elif command -v vim &> /dev/null; then
        echo "Opening .env in vim..."
        vim .env
    else
        echo "Please edit ./.env manually with your preferred editor"
    fi
fi

echo ""
echo "🚀 Setup complete! Next steps:"
echo ""
echo "1. Configure your OpenAI credentials in ./.env"
echo "2. Start the backend server:"
echo "   npm run dev"
echo ""
echo "3. Open demo.html in your browser to test the widget"
echo ""
echo "📚 For more information:"
echo "   - Main documentation: README.md"
echo ""
echo "✨ Happy chatting!"
