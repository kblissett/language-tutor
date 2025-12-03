import OpenAI from 'openai';

interface Message {
    role: 'user' | 'assistant';
    content: string;
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

        // Add user message
        this.addMessage('user', content);
        this.userInput.value = '';
        this.autoResizeTextarea();

        // Disable input while streaming
        this.isStreaming = true;
        this.sendBtn.disabled = true;
        this.userInput.disabled = true;

        try {
            // Create assistant message element
            const assistantMessageDiv = this.createMessageElement('assistant', '');
            const contentDiv = assistantMessageDiv.querySelector('.message-content') as HTMLElement;

            // Stream the response
            const stream = await this.openai.chat.completions.create({
                model: 'gpt-5-mini',
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

        } catch (error) {
            console.error('Error:', error);
            const errorMessage = error instanceof Error ? error.message : 'An error occurred';
            this.addMessage('assistant', `Error: ${errorMessage}`);

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

    private addMessage(role: 'user' | 'assistant', content: string): void {
        this.messages.push({ role, content });
        this.createMessageElement(role, content);
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
