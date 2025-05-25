// ==UserScript==
// @name         RedBot UI for Bustabit
// @namespace    https://bustabit.com/play
// @version      2025-05-23
// @description  Adds a floating UI element for the chat bot Redbot on Bustabit.com
// @author       @phpfuck
// @match        https://bustabit.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=bustabit.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Constants for better maintainability
    const CONSTANTS = {
        ENABLEUT: false,
        VALID_CHATS: ['spam', 'redbot'],
        SELECTORS: {
            CHAT_TITLE: '[class*="_channelTitle_"]',
            CHAT_INPUT: '[class*="_chatInput_"]',
            BET_CONTROLS: '[class*="_betControls_"]',
            CHAT_MESSAGES: '[class*="_chatMessage_"]'
        },
        TIMEOUTS: {
            ELEMENT_WAIT: 5000,
            INIT_DELAY: 3000
        },
        DEFAULT_BET: 2,
        CONTAINER_ID: 'redBetContainer',
        STORAGE_KEY: 'redbot_last_bet_amount',
        HISTORY_STORAGE_KEY: 'redbot_bet_history',
        HISTORY_PAGE_SIZE: 30
    };

    // Enhanced utilities with better error handling
    const Utils = {
        /**
         * Safely triggers input events on form elements
         * @param {HTMLInputElement} input - The input element
         * @param {string} value - The value to set
         */
        typeValue(input, value) {
            if (!input || typeof input.value === 'undefined') {
                throw new Error('Invalid input element provided');
            }

            const lastValue = input.value;
            input.value = value;

            // Create and dispatch input event
            const inputEvent = new Event('input', {
                bubbles: true,
                cancelable: true,
                composed: true // For better Shadow DOM compatibility
            });

            // Handle React's value tracker if present
            if (input._valueTracker && typeof input._valueTracker.setValue === 'function') {
                input._valueTracker.setValue(lastValue);
            }

            input.dispatchEvent(inputEvent);
        },

        /**
         * Creates a keyboard event with cross-browser compatibility
         * @param {string} key - The key to simulate
         * @returns {KeyboardEvent}
         */
        createKeyboardEvent(key = 'Enter') {
            try {
                return new KeyboardEvent('keydown', {
                    bubbles: true,
                    cancelable: true,
                    key: key,
                    code: key === 'Enter' ? 'Enter' : key,
                    composed: true
                });
            } catch (e) {
                // Fallback for older browsers
                const event = document.createEvent('KeyboardEvent');
                if (event.initKeyboardEvent) {
                    event.initKeyboardEvent('keydown', true, true, window, key);
                }
                return event;
            }
        },

        /**
         * Safely queries for an element with error handling
         * @param {string} selector - CSS selector
         * @returns {Element|null}
         */
        safeQuerySelector(selector) {
            try {
                return document.querySelector(selector);
            } catch (e) {
                console.warn(`Failed to query selector: ${selector}`, e);
                return null;
            }
        },

        /**
         * Sanitizes and validates numeric input
         * @param {string|number} value - The value to sanitize
         * @returns {number}
         */
        sanitizeNumericInput(value) {
            const num = parseFloat(value);
            return isNaN(num) || num < 1 ? CONSTANTS.DEFAULT_BET : Math.max(1, Math.floor(num));
        },

        /**
         * Gets the last saved bet amount from localStorage
         * @returns {number}
         */
        getLastBetAmount() {
            try {
                const saved = localStorage.getItem(CONSTANTS.STORAGE_KEY);
                return saved ? this.sanitizeNumericInput(saved) : CONSTANTS.DEFAULT_BET;
            } catch (e) {
                console.warn('Failed to read from localStorage:', e);
                return CONSTANTS.DEFAULT_BET;
            }
        },

        /**
         * Saves the bet amount to localStorage
         * @param {string|number} amount - The amount to save
         */
        saveLastBetAmount(amount) {
            try {
                const sanitized = this.sanitizeNumericInput(amount);
                localStorage.setItem(CONSTANTS.STORAGE_KEY, sanitized.toString());
            } catch (e) {
                console.warn('Failed to save to localStorage:', e);
            }
        }
    };

    // History Management System
    const BetHistory = {
        pendingBet: null,

        /**
         * Gets all bet history from localStorage
         * @returns {Array}
         */
        getHistory() {
            try {
                const history = localStorage.getItem(CONSTANTS.HISTORY_STORAGE_KEY);
                return history ? JSON.parse(history) : [];
            } catch (e) {
                console.warn('Failed to load bet history:', e);
                return [];
            }
        },

        /**
         * Saves bet history to localStorage
         * @param {Array} history - The history array to save
         */
        saveHistory(history) {
            try {
                localStorage.setItem(CONSTANTS.HISTORY_STORAGE_KEY, JSON.stringify(history));
            } catch (e) {
                console.warn('Failed to save bet history:', e);
            }
        },

        /**
         * Records a new bet placed
         * @param {number} amount - Bet amount
         * @param {string} type - Bet type ('red' or 'lo')
         */
        recordBetPlaced(amount, type) {
            this.pendingBet = {
                id: Date.now(),
                timestamp: new Date().toISOString(),
                amount: amount,
                type: type,
                status: 'pending',
                result: null
            };
        },

        /**
         * Updates the pending bet with result
         * @param {string} result - 'win', 'loss', or 'not_placed'
         * @param {number|null} winAmount - Amount won/lost
         */
        updateBetResult(result, winAmount = null) {
            if (!this.pendingBet) return;

            this.pendingBet.status = result;
            this.pendingBet.result = winAmount;

            const history = this.getHistory();
            history.unshift(this.pendingBet);
            this.saveHistory(history);

            // Update UI
            RedBotUI.updateHistoryDisplay();

            this.pendingBet = null;
        },

        /**
         * Gets paginated history
         * @param {number} page - Page number (0-based)
         * @param {number} pageSize - Items per page
         * @returns {Object}
         */
        getPaginatedHistory(page = 0, pageSize = CONSTANTS.HISTORY_PAGE_SIZE) {
            const history = this.getHistory();
            const startIndex = page * pageSize;
            const endIndex = startIndex + pageSize;
            const pageData = history.slice(startIndex, endIndex);

            return {
                data: pageData,
                currentPage: page,
                totalPages: Math.ceil(history.length / pageSize),
                totalItems: history.length,
                hasNext: endIndex < history.length,
                hasPrev: page > 0
            };
        },

        /**
         * Clears all bet history
         */
        clearHistory() {
            try {
                localStorage.removeItem(CONSTANTS.HISTORY_STORAGE_KEY);
                RedBotUI.updateHistoryDisplay();
            } catch (e) {
                console.warn('Failed to clear bet history:', e);
            }
        }
    };

    // Chat message listener and parser
    const ChatListener = {
        observer: null,
        lastProcessedMessage: null,

        /**
         * Starts listening to chat messages
         */
        startListening() {
            if (this.observer) {
                this.stopListening();
            }

            this.observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                this.processChatMessages(node);
                            }
                        });
                    }
                });
            });

            // Start observing chat container
            const chatContainer = document.querySelector('[class*="_chatMessages_"]');
            if (chatContainer) {
                this.observer.observe(chatContainer, {
                    childList: true,
                    subtree: true
                });
            }
        },

        /**
         * Stops listening to chat messages
         */
        stopListening() {
            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
            }
        },

        /**
         * Processes new chat messages
         * @param {Element} node - DOM node to check for chat messages
         */
        processChatMessages(node) {
            const messages = node.querySelectorAll ?
                node.querySelectorAll('[class*="_chatMessage_"]') :
                (node.matches && node.matches('[class*="_chatMessage_"]') ? [node] : []);

            messages.forEach(messageEl => {
                const usernameEl = messageEl.querySelector('[class*="_username_"]');
                const messageTextEl = messageEl.querySelector('[class*="_messageText_"]');

                if (usernameEl && messageTextEl) {
                    const username = usernameEl.textContent.trim().toLowerCase();
                    const messageText = messageTextEl.textContent.trim();

                    // Only process messages from redbot
                    if (username === 'redbot' && messageText !== this.lastProcessedMessage) {
                        this.parseRedBotMessage(messageText);
                        this.lastProcessedMessage = messageText;
                    }
                }
            });
        },

        /**
         * Parses RedBot messages to extract bet information
         * @param {string} message - The message text from RedBot
         */
        parseRedBotMessage(message) {
            const lowerMessage = message.toLowerCase();

            // Check for bet placement confirmations
            const betPlacedMatch = message.match(/You have bet (\d+(?:\.\d+)?) bits on the next game being (red|under \d+(?:\.\d+)?x)/i);
            if (betPlacedMatch) {
                const amount = parseFloat(betPlacedMatch[1]);
                const type = betPlacedMatch[2].startsWith('under') ? 'lo' : 'red';
                // Don't record here as it's handled by the command execution
                return;
            }

            // Check for bet not placed
            if (lowerMessage.includes('bets are now closed')) {
                BetHistory.updateBetResult('not_placed', null);
                return;
            }

            // Check for win/loss results
            const winMatch = message.match(/(The game was red\. You won|The game was a low red\. You won) ([\d.]+) bits!/i);
            if (winMatch) {
                const winAmount = parseFloat(winMatch[2]);
                BetHistory.updateBetResult('win', winAmount);
                return;
            }

            const lossMatch = message.match(/(The game was green\. You lost|The game was not a low red\. You lost) ([\d.]+) bits\./i);
            if (lossMatch) {
                const lossAmount = parseFloat(lossMatch[2]);
                BetHistory.updateBetResult('loss', -lossAmount);
                return;
            }
        }
    };

    // Chat validation with improved error messages
    const ChatValidator = {
        /**
         * Validates if user is on correct chat channel
         * @returns {boolean}
         */
        isValidChat() {
            const chatTitle = Utils.safeQuerySelector(CONSTANTS.SELECTORS.CHAT_TITLE);

            if (!chatTitle) {
                this.showError('You must be on the chat tab');
                return false;
            }

            const chatName = chatTitle.textContent?.toLowerCase().trim();
            if (!chatName || !CONSTANTS.VALID_CHATS.includes(chatName)) {
                this.showError(`Chat must be ${CONSTANTS.VALID_CHATS.join(' or ').toUpperCase()}`);
                return false;
            }

            return true;
        },

        /**
         * Gets the chat input element with validation
         * @returns {HTMLElement|null}
         */
        getChatInput() {
            const chatInput = Utils.safeQuerySelector(CONSTANTS.SELECTORS.CHAT_INPUT);
            if (!chatInput) {
                this.showError('Chat input not found');
                return null;
            }
            return chatInput;
        },

        /**
         * Shows error message to user
         * @param {string} message - Error message
         */
        showError(message) {
            // Use console.warn instead of alert for better UX
            console.warn(`Redbot UserScript: ${message}`);

            // Optional: Create a non-intrusive notification
            this.showToast(message, 'error');
        },

        /**
         * Shows a non-intrusive toast notification
         * @param {string} message - Message to show
         * @param {string} type - Type of message (error, success, info)
         */
        showToast(message, type = 'info') {
            const existingToast = document.getElementById('redbot-toast');
            if (existingToast) {
                existingToast.remove();
            }

            const toast = document.createElement('div');
            toast.id = 'redbot-toast';
            toast.textContent = message;

            Object.assign(toast.style, {
                position: 'fixed',
                top: '20px',
                right: '20px',
                padding: '12px 16px',
                borderRadius: '6px',
                color: 'white',
                fontFamily: 'Arial, sans-serif',
                fontSize: '14px',
                zIndex: '10000',
                opacity: '0',
                transition: 'opacity 0.3s ease',
                backgroundColor: type === 'error' ? '#dc3545' : type === 'success' ? '#28a745' : '#007bff'
            });

            document.body.appendChild(toast);

            // Animate in
            requestAnimationFrame(() => {
                toast.style.opacity = '1';
            });

            // Auto remove after 3 seconds
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.style.opacity = '0';
                    setTimeout(() => toast.remove(), 300);
                }
            }, 3000);
        }
    };

    // Bot command handlers with improved validation
    const BotCommands = {
        /**
         * Executes a bot command
         * @param {string} command - The command to execute
         * @param {string|number} [amount] - Optional amount parameter
         */
        executeCommand(command, amount = null) {
            if (!ChatValidator.isValidChat()) return;

            const chatInput = ChatValidator.getChatInput();
            if (!chatInput) return;

            const commandText = amount !== null ? `${command} ${Utils.sanitizeNumericInput(amount)}` : command;

            try {
                Utils.typeValue(chatInput, commandText);
                chatInput.dispatchEvent(Utils.createKeyboardEvent('Enter'));
                ChatValidator.showToast(`Command executed: ${commandText}`, 'success');
            } catch (error) {
                console.error('Failed to execute command:', error);
                ChatValidator.showError('Failed to execute command');
            }
        },

        placeBet(amount) {
            const sanitizedAmount = Utils.sanitizeNumericInput(amount);
            BetHistory.recordBetPlaced(sanitizedAmount, 'red');
            this.executeCommand('$bet', sanitizedAmount);
        },

        placeLoBet(amount) {
            const sanitizedAmount = Utils.sanitizeNumericInput(amount);
            BetHistory.recordBetPlaced(sanitizedAmount, 'lo');
            this.executeCommand('$lo', sanitizedAmount);
        },
        checkBalance() {
            this.executeCommand('$bal');
        },
        placeUtBet(amount) {
            const sanitizedAmount = Utils.sanitizeNumericInput(amount);
            BetHistory.recordBetPlaced(sanitizedAmount, 'ut');
            this.executeCommand('$ut', sanitizedAmount);
        }
    };

    // UI Component factory with better styling
    const UIFactory = {
        /**
         * Creates a styled button element
         * @param {Object} config - Button configuration
         * @returns {HTMLButtonElement}
         */
        createButton({ id, text, bgColor, shadowColor, onClick }) {
            const button = document.createElement('button');
            button.id = id;
            button.type = 'button'; // Explicit type for form compatibility

            // Apply styles with CSS custom properties for easier maintenance
            Object.assign(button.style, {
                width: '30%',
                minWidth: '80px',
                border: 'none',
                fontFamily: 'inherit',
                fontSize: '1.1em',
                display: 'inline-block',
                textTransform: 'uppercase',
                letterSpacing: '5px',
                fontWeight: '900',
                outline: 'none',
                position: 'relative',
                transition: 'all 0.3s ease',
                borderRadius: '5px',
                padding: '0.5rem 1rem',
                overflow: 'hidden',
                marginLeft: '10px',
                marginBottom: '15px',
                background: bgColor,
                color: '#fff',
                boxShadow: `0 5px ${shadowColor}`,
                cursor: 'pointer',
                userSelect: 'none',
                // Improve accessibility
                '-webkit-tap-highlight-color': 'transparent'
            });

            // Add hover and active states
            button.addEventListener('mouseenter', () => {
                button.style.transform = 'translateY(-2px)';
                button.style.boxShadow = `0 7px ${shadowColor}`;
            });

            button.addEventListener('mouseleave', () => {
                button.style.transform = 'translateY(0)';
                button.style.boxShadow = `0 5px ${shadowColor}`;
            });

            button.addEventListener('mousedown', () => {
                button.style.transform = 'translateY(2px)';
                button.style.boxShadow = `0 3px ${shadowColor}`;
            });

            button.addEventListener('mouseup', () => {
                button.style.transform = 'translateY(-2px)';
                button.style.boxShadow = `0 7px ${shadowColor}`;
            });

            const span = document.createElement('span');
            span.textContent = text;
            button.appendChild(span);

            if (onClick && typeof onClick === 'function') {
                button.addEventListener('click', onClick);
            }

            return button;
        },

        /**
         * Creates the main container for the betting interface
         * @returns {HTMLDivElement}
         */
        createContainer() {
            const container = document.createElement('div');
            container.id = CONSTANTS.CONTAINER_ID;

            Object.assign(container.style, {
                padding: '10px',
                margin: '10px 0',
                background: 'rgba(20, 20, 20, 0.75)',
                borderRadius: '10px',
                border: '1px solid #333',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'flex-start',
                zIndex: '9999',
                position: 'fixed',
                bottom: '60px',
                right: '20px',
                width: '400px',
                maxWidth: 'calc(100vw - 40px)', // Responsive width
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                backdropFilter: 'blur(5px)', // Modern blur effect
                WebkitBackdropFilter: 'blur(5px)', // Safari compatibility
                maxHeight: '80vh',
                overflowY: 'auto'
            });

            return container;
        },

        /**
         * Creates the input group for bet amount
         * @returns {HTMLDivElement}
         */
          createInputGroup() {
            const inputGroup = document.createElement('div');
            inputGroup.style.flex = '100%';
            inputGroup.style.marginBottom = '10px';

            // Create container for label and support link
            const labelContainer = document.createElement('div');
            Object.assign(labelContainer.style, {
                display: 'inline-block',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '5px',
                width: '100%'
            });

            const label = document.createElement('label');
            label.textContent = 'Bet Amount';
            Object.assign(label.style, {
                color: 'white',
                fontSize: '14px',
                float: 'left',
                fontWeight: '600'
            });

            // Create support link
            const supportLink = document.createElement('span');
            supportLink.innerHTML = ' <a href="https://bustabit.com/user/phpfuck" style="color: #e58929; text-decoration: none;">@phpfuck</a> Loves You';
            Object.assign(supportLink.style, {
                color: 'white',
                fontSize: '14px',
                float: 'right'
            });

            labelContainer.appendChild(label);
            labelContainer.appendChild(supportLink);

            const input = document.createElement('input');
            input.type = 'number';
            input.name = 'redwager';
            input.min = '1';
            input.step = '1';
            input.value = Utils.getLastBetAmount().toString(); // Load saved amount

            Object.assign(input.style, {
                width: '100%',
                padding: '8px 12px',
                borderRadius: '5px',
                border: '1px solid #555',
                background: '#222',
                color: 'white',
                fontSize: '16px', // Prevent zoom on iOS
                boxSizing: 'border-box'
            });

            // Add input validation and save on change
            input.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                if (isNaN(value) || value < 1) {
                    e.target.setCustomValidity('Bet amount must be at least 1');
                } else {
                    e.target.setCustomValidity('');
                    // Save the valid bet amount
                    Utils.saveLastBetAmount(value);
                }
            });

            // Save bet amount when input loses focus
            input.addEventListener('blur', (e) => {
                Utils.saveLastBetAmount(e.target.value);
            });

            // Add Enter key functionality to trigger bet
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.keyCode === 13) {
                    e.preventDefault();
                    const betButton = document.getElementById('redbotBet');
                    if (betButton) {
                        betButton.click();
                    }
                }
            });

            inputGroup.appendChild(labelContainer);
            inputGroup.appendChild(input);

            return inputGroup;
        },

        /**
         * Creates the history panel
         * @returns {HTMLDivElement}
         */
        createHistoryPanel() {
            const historyPanel = document.createElement('div');
            historyPanel.id = 'historyPanel';
            historyPanel.style.flex = '100%';
            historyPanel.style.marginTop = '10px';

            // History toggle button
            const historyToggle = document.createElement('button');
            historyToggle.id = 'historyToggle';
            historyToggle.textContent = '📊 HISTORY';
            Object.assign(historyToggle.style, {
                width: '100%',
                padding: '8px',
                background: '#333',
                color: 'white',
                border: '1px solid #555',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                transition: 'all 0.3s ease'
            });

            // History content (initially hidden)
            const historyContent = document.createElement('div');
            historyContent.id = 'historyContent';
            historyContent.style.display = 'none';
            historyContent.style.marginTop = '10px';

            let isExpanded = false;
            historyToggle.addEventListener('click', () => {
                isExpanded = !isExpanded;
                historyContent.style.display = isExpanded ? 'block' : 'none';
                historyToggle.textContent = isExpanded ? '📊 HISTORY ▼' : '📊 HISTORY ▶';
                if (isExpanded) {
                    RedBotUI.updateHistoryDisplay();
                }
            });

            historyPanel.appendChild(historyToggle);
            historyPanel.appendChild(historyContent);

            return historyPanel;
        },

        /**
         * Creates the history table
         * @param {Array} historyData - Array of bet history items
         * @returns {HTMLElement}
         */
        createHistoryTable(historyData) {
            const container = document.createElement('div');

            // Clear history button
            const clearButton = document.createElement('button');
            clearButton.textContent = 'Clear History';
            Object.assign(clearButton.style, {
                padding: '4px 8px',
                background: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '12px',
                marginBottom: '10px'
            });
            clearButton.addEventListener('click', () => {
                if (confirm('Are you sure you want to clear all bet history?')) {
                    BetHistory.clearHistory();
                }
            });

            // Table
            const table = document.createElement('table');
            Object.assign(table.style, {
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '12px',
                color: 'white'
            });

            // Header
            const header = table.createTHead();
            const headerRow = header.insertRow();
            ['Bet Amount', 'Bet Type', 'Win/Loss'].forEach(text => {
                const th = document.createElement('th');
                th.textContent = text;
                Object.assign(th.style, {
                    padding: '8px 4px',
                    borderBottom: '1px solid #555',
                    textAlign: 'left',
                    fontWeight: '600'
                });
                headerRow.appendChild(th);
            });

            // Body
            const tbody = table.createTBody();

            if (historyData.length === 0) {
                const row = tbody.insertRow();
                const cell = row.insertCell();
                cell.colSpan = 3;
                cell.textContent = 'No bet history available';
                cell.style.textAlign = 'center';
                cell.style.padding = '16px';
                cell.style.color = '#888';
            } else {
                historyData.forEach(bet => {
                    const row = tbody.insertRow();

                    // Bet amount
                    const amountCell = row.insertCell();
                    amountCell.textContent = `${bet.amount} bits`;
                    amountCell.style.padding = '6px 4px';

                    // Bet type
                    const typeCell = row.insertCell();
                    typeCell.textContent = bet.type.toUpperCase();
                    typeCell.style.padding = '6px 4px';

                    // Win/Loss
                    const resultCell = row.insertCell();
                    resultCell.style.padding = '6px 4px';

                    if (bet.status === 'not_placed') {
                        resultCell.textContent = 'N/A';
                        resultCell.style.color = '#888';
                    } else if (bet.status === 'pending') {
                        resultCell.textContent = 'Pending...';
                        resultCell.style.color = '#ffc107';
                    } else if (bet.status === 'win') {
                        resultCell.textContent = `+${bet.result} bits`;
                        resultCell.style.color = '#28a745';
                    } else if (bet.status === 'loss') {
                        resultCell.textContent = `${bet.result} bits`;
                        resultCell.style.color = '#dc3545';
                    }
                });
            }

            container.appendChild(clearButton);
            container.appendChild(table);

            return container;
        },

        /**
         * Creates pagination controls
         * @param {Object} paginationInfo - Pagination information
         * @param {Function} onPageChange - Page change callback
         * @returns {HTMLElement}
         */
        createPaginationControls(paginationInfo, onPageChange) {
            const container = document.createElement('div');
            Object.assign(container.style, {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '10px',
                fontSize: '12px',
                color: 'white'
            });

            // Previous button
            const prevButton = document.createElement('button');
            prevButton.textContent = '← Prev';
            prevButton.disabled = !paginationInfo.hasPrev;
            Object.assign(prevButton.style, {
                padding: '4px 8px',
                background: paginationInfo.hasPrev ? '#007bff' : '#555',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: paginationInfo.hasPrev ? 'pointer' : 'not-allowed',
                fontSize: '12px'
            });
            if (paginationInfo.hasPrev) {
                prevButton.addEventListener('click', () => onPageChange(paginationInfo.currentPage - 1));
            }

            // Page info
            const pageInfo = document.createElement('span');
            pageInfo.textContent = `Page ${paginationInfo.currentPage + 1} of ${paginationInfo.totalPages || 1}`;

            // Next button
            const nextButton = document.createElement('button');
            nextButton.textContent = 'Next →';
            nextButton.disabled = !paginationInfo.hasNext;
            Object.assign(nextButton.style, {
                padding: '4px 8px',
                background: paginationInfo.hasNext ? '#007bff' : '#555',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: paginationInfo.hasNext ? 'pointer' : 'not-allowed',
                fontSize: '12px'
            });
            if (paginationInfo.hasNext) {
                nextButton.addEventListener('click', () => onPageChange(paginationInfo.currentPage + 1));
            }

            container.appendChild(prevButton);
            container.appendChild(pageInfo);
            container.appendChild(nextButton);

            return container;
        }
    };

    // Main application controller
    const RedBotUI = {
        container: null,
        currentPage: 0,

        /**
         * Initializes the UI components
         */
        createUI() {
            this.container = UIFactory.createContainer();

            const inputGroup = UIFactory.createInputGroup();
            this.container.appendChild(inputGroup);

            // Create buttons with improved configuration
            const buttons = [
                {
                    id: 'redbotBet',
                    text: 'BET',
                    bgColor: '#c81111',
                    shadowColor: '#570808',
                    onClick: () => this.handleBetClick()
                },
                {
                    id: 'redbotLo',
                    text: 'LO',
                    bgColor: '#1183c8',
                    shadowColor: '#1a3e6c',
                    onClick: () => this.handleLoClick()
                }
            ];

            if(!CONSTANTS.ENABLEUT) {
                buttons.push({id: 'redbotBal', text: 'BAL', bgColor: '#4ec11a',shadowColor: '#3d6c06',onClick: () => this.handleBalClick()});
            } else {
                buttons.push( {id: 'redbotUt', text: 'UT', bgColor: 'rgb(160, 22, 210)', shadowColor: 'rgb(107, 16, 149)',onClick: () => this.handleUTClick() });
            }

            buttons.forEach(buttonConfig => {
                const button = UIFactory.createButton(buttonConfig);
                this.container.appendChild(button);
            });

            // Add history panel
            const historyPanel = UIFactory.createHistoryPanel();
            this.container.appendChild(historyPanel);

            return this.container;
        },

        /**
         * Event handlers for button clicks
         */
        handleBetClick() {
            const amount = this.getBetAmount();
            BotCommands.placeBet(amount);
        },

        handleLoClick() {
            const amount = this.getBetAmount();
            BotCommands.placeLoBet(amount);
        },

        handleBalClick() {
            BotCommands.checkBalance();
        },
        handleUTClick() {
            const amount = this.getBetAmount();
            BotCommands.placeUtBet(amount);
        },

        /**
         * Gets the current bet amount from input
         * @returns {number}
         */
        getBetAmount() {
            const input = Utils.safeQuerySelector('[name="redwager"]');
            return input ? Utils.sanitizeNumericInput(input.value) : CONSTANTS.DEFAULT_BET;
        },

        /**
         * Updates the history display
         */
        updateHistoryDisplay() {
            const historyContent = document.getElementById('historyContent');
            if (!historyContent) return;

            const paginationInfo = BetHistory.getPaginatedHistory(this.currentPage);

            // Clear existing content
            historyContent.innerHTML = '';

            // Create history table
            const historyTable = UIFactory.createHistoryTable(paginationInfo.data);
            historyContent.appendChild(historyTable);

            // Add pagination if needed
            if (paginationInfo.totalPages > 1) {
                const paginationControls = UIFactory.createPaginationControls(
                    paginationInfo,
                    (newPage) => {
                        this.currentPage = newPage;
                        this.updateHistoryDisplay();
                    }
                );
                historyContent.appendChild(paginationControls);
            }

            // Add summary info
            const summaryDiv = document.createElement('div');
            summaryDiv.style.marginTop = '10px';
            summaryDiv.style.fontSize = '12px';
            summaryDiv.style.color = '#888';
            summaryDiv.textContent = `Total bets: ${paginationInfo.totalItems}`;
            historyContent.appendChild(summaryDiv);
        },

        /**
         * Removes existing UI if present
         */
        cleanup() {
            const existing = document.getElementById(CONSTANTS.CONTAINER_ID);
            if (existing) {
                existing.remove();
            }
        }
    };

    // Enhanced element waiting with timeout and better error handling
    const DOMUtils = {
        /**
         * Waits for an element to appear in the DOM
         * @param {string} selector - CSS selector to wait for
         * @param {number} timeout - Timeout in milliseconds
         * @returns {Promise<Element>}
         */
        waitForElement(selector, timeout = CONSTANTS.TIMEOUTS.ELEMENT_WAIT) {
            return new Promise((resolve, reject) => {
                const element = Utils.safeQuerySelector(selector);
                if (element) {
                    return resolve(element);
                }

                const observer = new MutationObserver(() => {
                    const el = Utils.safeQuerySelector(selector);
                    if (el) {
                        observer.disconnect();
                        resolve(el);
                    }
                });

                observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                    attributes: false,
                    characterData: false
                });

                // Set timeout
                setTimeout(() => {
                    observer.disconnect();
                    reject(new Error(`Element not found: ${selector} (timeout: ${timeout}ms)`));
                }, timeout);
            });
        },

        /**
         * Wrapper for async operations with timeout
         * @param {Promise} promise - Promise to execute
         * @param {number} timeout - Timeout in milliseconds
         * @returns {Promise}
         */
        withTimeout(promise, timeout) {
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout);
            });

            return Promise.race([promise, timeoutPromise]);
        }
    };

    // Main initialization function
    const App = {
        async init() {
            try {
                console.log('Initializing Redbot UserScript...');

                // Wait for the bet controls to be available
                await DOMUtils.withTimeout(
                    DOMUtils.waitForElement(CONSTANTS.SELECTORS.BET_CONTROLS),
                    CONSTANTS.TIMEOUTS.ELEMENT_WAIT
                );

                // Clean up any existing UI
                RedBotUI.cleanup();

                // Create and insert the new UI
                const container = RedBotUI.createUI();
                document.body.appendChild(container);

                // Start listening to chat messages
                ChatListener.startListening();

                console.log('Redbot UserScript initialized successfully');
                ChatValidator.showToast('Redbot UI loaded', 'success');

            } catch (error) {
                console.error('Failed to initialize Redbot UserScript:', error);
                ChatValidator.showToast('Failed to load Redbot UI', 'error');
            }
        },

        /**
         * Handles page state changes
         */
        handleStateChange() {
            if (document.readyState === 'complete') {
                // Delay initialization to ensure all dynamic content is loaded
                setTimeout(() => this.init(), CONSTANTS.TIMEOUTS.INIT_DELAY);
            }
        },

        /**
         * Cleanup function
         */
        cleanup() {
            ChatListener.stopListening();
            RedBotUI.cleanup();
        }
    };

    // Initialize the application
    if (document.readyState === 'loading') {
        document.addEventListener('readystatechange', () => App.handleStateChange());
    } else {
        // Document already loaded
        setTimeout(() => App.init(), CONSTANTS.TIMEOUTS.INIT_DELAY);
    }

    // Handle dynamic page navigation (SPA behavior)
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            App.cleanup(); // Clean up before reinitializing
            setTimeout(() => App.init(), 1000); // Re-initialize on navigation
        }
    }).observe(document, { subtree: true, childList: true });

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        App.cleanup();
    });

})();
