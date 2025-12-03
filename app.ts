import OpenAI from 'openai';

interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

interface UserMessage extends Message {
    role: 'user';
    corrections?: string;
}

interface CorrectionResponse {
    hasCorrections: boolean;
    corrections: Array<{
        type: 'error' | 'style';
        original: string;
        suggestion: string;
        explanation: string;
    }>;
}

class ChatApp {
    private openai: OpenAI | null = null;
    private messages: Message[] = [];
    private messagesContainer: HTMLElement;
    private userInput: HTMLTextAreaElement;
    private sendBtn: HTMLButtonElement;
    private settingsBtn: HTMLButtonElement;
    private settingsModal: HTMLElement;
    private closeModalBtn: HTMLButtonElement;
    private apiKeyInput: HTMLInputElement;
    private saveSettingsBtn: HTMLButtonElement;
    private isStreaming = false;

    constructor() {
        this.messagesContainer = document.getElementById('messages') as HTMLElement;
        this.userInput = document.getElementById('user-input') as HTMLTextAreaElement;
        this.sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
        this.settingsBtn = document.getElementById('settings-btn') as HTMLButtonElement;
        this.settingsModal = document.getElementById('settings-modal') as HTMLElement;
        this.closeModalBtn = document.getElementById('close-modal') as HTMLButtonElement;
        this.apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
        this.saveSettingsBtn = document.getElementById('save-settings') as HTMLButtonElement;

        this.init();
    }

    private init(): void {
        this.loadApiKey();
        this.setupEventListeners();
        this.autoResizeTextarea();

        // Add system message for Spanish conversation partner
        this.messages.push({
            role: 'system',
            content: `You are a friendly and patient Spanish conversation partner helping language learners practice their Spanish. Your role is to:

- Have natural, engaging conversations entirely in Spanish
- Be warm, approachable, and encouraging
- Keep the conversation flowing by asking follow-up questions
- Adapt to the learner's level while gently introducing new vocabulary
- Discuss a variety of interesting topics
- Be enthusiastic and make learning feel like chatting with a friend

Remember: You're here to help them practice, so always respond in Spanish and keep the conversation going!`
        });

        // Show settings if no API key
        if (!this.openai) {
            this.showSettings();
        }
    }

    private loadApiKey(): void {
        const apiKey = localStorage.getItem('openai_api_key');
        if (apiKey) {
            this.openai = new OpenAI({
                apiKey,
                dangerouslyAllowBrowser: true,
            });
            this.apiKeyInput.value = apiKey;
        }
    }

    private saveApiKey(): void {
        const apiKey = this.apiKeyInput.value.trim();
        if (!apiKey) {
            alert('Please enter an API key');
            return;
        }

        localStorage.setItem('openai_api_key', apiKey);
        this.openai = new OpenAI({
            apiKey,
            dangerouslyAllowBrowser: true,
        });

        this.hideSettings();
    }

    private setupEventListeners(): void {
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        this.userInput.addEventListener('input', () => this.autoResizeTextarea());

        this.settingsBtn.addEventListener('click', () => this.showSettings());
        this.closeModalBtn.addEventListener('click', () => this.hideSettings());
        this.saveSettingsBtn.addEventListener('click', () => this.saveApiKey());

        // Close modal on background click
        this.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.settingsModal) {
                this.hideSettings();
            }
        });

        // Close modal on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.settingsModal.hidden) {
                this.hideSettings();
            }
        });
    }

    private autoResizeTextarea(): void {
        this.userInput.style.height = 'auto';
        const maxHeight = 200;
        this.userInput.style.height = Math.min(this.userInput.scrollHeight, maxHeight) + 'px';
    }

    private showSettings(): void {
        this.settingsModal.hidden = false;
        this.apiKeyInput.focus();
    }

    private hideSettings(): void {
        this.settingsModal.hidden = true;
    }

    private async sendMessage(): Promise<void> {
        if (!this.openai) {
            alert('Please set your API key in settings');
            this.showSettings();
            return;
        }

        const content = this.userInput.value.trim();
        if (!content || this.isStreaming) return;

        this.userInput.value = '';
        this.autoResizeTextarea();

        // Disable input while streaming
        this.isStreaming = true;
        this.sendBtn.disabled = true;
        this.userInput.disabled = true;

        try {
            // Get corrections for user message (in parallel with adding message)
            const correctionsPromise = this.getCorrections(content);

            // Add user message (will be updated with corrections later)
            const userMessageElement = this.createMessageElement('user', content);
            this.messages.push({ role: 'user', content });

            // Create assistant message element
            const assistantMessageDiv = this.createMessageElement('assistant', '');
            const contentDiv = assistantMessageDiv.querySelector('.message-content') as HTMLElement;

            // Stream the response
            const stream = await this.openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: this.messages,
                stream: true,
            });

            let fullContent = '';

            for await (const chunk of stream) {
                const delta = chunk.choices[0]?.delta?.content || '';
                fullContent += delta;
                contentDiv.textContent = fullContent;
                this.scrollToBottom();
            }

            // Add complete message to history
            this.messages.push({ role: 'assistant', content: fullContent });

            // Add corrections to user message once ready
            const corrections = await correctionsPromise;
            if (corrections) {
                this.addCorrectionsToMessage(userMessageElement, corrections);
            }

        } catch (error) {
            console.error('Error:', error);
            const errorMessage = error instanceof Error ? error.message : 'An error occurred';
            this.createMessageElement('assistant', `Error: ${errorMessage}`);

            // If it's an auth error, show settings
            if (errorMessage.includes('401') || errorMessage.includes('API key')) {
                setTimeout(() => this.showSettings(), 1000);
            }
        } finally {
            this.isStreaming = false;
            this.sendBtn.disabled = false;
            this.userInput.disabled = false;
            this.userInput.focus();
        }
    }

    private async getCorrections(userMessage: string): Promise<CorrectionResponse | null> {
        if (!this.openai) return null;

        try {
            const response = await this.openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: `You are a Spanish language coach. Analyze the user's Spanish message for:
1. ERRORS: Grammar, spelling, word choice mistakes
2. STYLE: Unnatural phrasing that could be more natural/idiomatic

For each issue, provide:
- Type (error or style)
- The original text
- The suggested improvement
- A brief explanation

Be thorough but concise. Catch both errors AND unnatural phrasing.`
                    },
                    {
                        role: 'user',
                        content: userMessage
                    }
                ],
                temperature: 0.3,
                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        name: 'correction_response',
                        strict: true,
                        schema: {
                            type: 'object',
                            properties: {
                                hasCorrections: {
                                    type: 'boolean',
                                    description: 'Whether the message has any errors that need correction'
                                },
                                corrections: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            type: {
                                                type: 'string',
                                                enum: ['error', 'style'],
                                                description: 'Whether this is an error or a style suggestion'
                                            },
                                            original: {
                                                type: 'string',
                                                description: 'The original text from the user message'
                                            },
                                            suggestion: {
                                                type: 'string',
                                                description: 'The suggested improvement'
                                            },
                                            explanation: {
                                                type: 'string',
                                                description: 'Brief explanation of the issue'
                                            }
                                        },
                                        required: ['type', 'original', 'suggestion', 'explanation'],
                                        additionalProperties: false
                                    }
                                }
                            },
                            required: ['hasCorrections', 'corrections'],
                            additionalProperties: false
                        }
                    }
                }
            });

            const content = response.choices[0]?.message?.content;
            if (!content) return null;

            return JSON.parse(content) as CorrectionResponse;
        } catch (error) {
            console.error('Error getting corrections:', error);
            return null;
        }
    }

    private addCorrectionsToMessage(messageElement: HTMLElement, correctionData: CorrectionResponse): void {
        // Only add corrections if there are actual errors
        if (!correctionData.hasCorrections || correctionData.corrections.length === 0) {
            return;
        }

        // Format corrections as text
        const correctionsText = correctionData.corrections
            .map(c => {
                const prefix = c.type === 'error' ? 'Error' : 'Style';
                return `${prefix}: ${c.suggestion}\n→ ${c.explanation}`;
            })
            .join('\n\n');

        // Create corrections container
        const correctionsContainer = document.createElement('div');
        correctionsContainer.className = 'corrections';
        correctionsContainer.hidden = true;

        const correctionsHeader = document.createElement('div');
        correctionsHeader.className = 'corrections-header';
        correctionsHeader.textContent = '💡 Coach\'s Notes';

        const correctionsContent = document.createElement('div');
        correctionsContent.className = 'corrections-content';
        correctionsContent.textContent = correctionsText;

        correctionsContainer.appendChild(correctionsHeader);
        correctionsContainer.appendChild(correctionsContent);

        // Add badge to toggle corrections
        const badge = document.createElement('button');
        badge.className = 'corrections-badge';
        badge.textContent = '💡';
        badge.setAttribute('aria-label', 'View corrections');
        badge.onclick = () => {
            const isHidden = correctionsContainer.hidden;
            correctionsContainer.hidden = !isHidden;
            badge.classList.toggle('active', !isHidden);
        };

        messageElement.appendChild(badge);
        messageElement.appendChild(correctionsContainer);
    }

    private createMessageElement(role: 'user' | 'assistant', content: string): HTMLElement {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}-message`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = content;

        messageDiv.appendChild(contentDiv);
        this.messagesContainer.appendChild(messageDiv);
        this.scrollToBottom();

        return messageDiv;
    }

    private scrollToBottom(): void {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
}

// Initialize the app
new ChatApp();
