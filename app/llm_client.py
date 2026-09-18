"""
Unified LLM Client supporting:
1. Groq (Qwen 2.5 - Default primary for ultra-fast LPU inference)
2. Google Gemini (Backup)
3. Transparent Deterministic Demo Mode (For offline testing / presentation safety)
"""

import os
import json
from typing import Dict, Any, Optional
from dotenv import load_dotenv

load_dotenv()


class LLMClient:
    def __init__(self):
        self.provider = os.getenv("LLM_PROVIDER", "groq").lower()
        self.groq_api_key = os.getenv("GROQ_API_KEY", "")
        self.groq_model = os.getenv("GROQ_MODEL", "qwen-2.5-32b")
        self.gemini_api_key = os.getenv("GEMINI_API_KEY", "")
        self.gemini_model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

        # Initialize Groq client if key is present
        self.groq_client = None
        if self.groq_api_key and self.groq_api_key != "your_groq_api_key_here":
            try:
                from groq import Groq
                self.groq_client = Groq(api_key=self.groq_api_key)
            except Exception as e:
                print(f"[LLM] Warning: Failed to initialize Groq client: {e}")

        # Initialize Gemini client if key is present
        self.gemini_client = None
        if self.gemini_api_key and self.gemini_api_key != "your_gemini_api_key_here":
            try:
                from google import genai
                self.gemini_client = genai.Client(api_key=self.gemini_api_key)
            except Exception as e:
                print(f"[LLM] Warning: Failed to initialize Gemini client: {e}")

    def is_live_llm_available(self) -> bool:
        """Returns True if a valid live LLM provider is configured."""
        if self.provider == "groq" and self.groq_client is not None:
            return True
        if self.provider == "gemini" and self.gemini_client is not None:
            return True
        return False

    def generate_json(self, prompt: str, system_prompt: str = "") -> Dict[str, Any]:
        """
        Generate structured JSON from the configured LLM.
        Falls back gracefully with explicit transparency.
        """
        # 1. Try Groq (Qwen 2.5) if configured
        if self.provider == "groq" and self.groq_client is not None:
            try:
                response = self.groq_client.chat.completions.create(
                    model=self.groq_model,
                    messages=[
                        {"role": "system", "content": system_prompt + "\nYou MUST return valid raw JSON only, without any markdown formatting, backticks, or commentary."},
                        {"role": "user", "content": prompt}
                    ],
                    temperature=0.1,
                    response_format={"type": "json_object"}
                )
                text = response.choices[0].message.content.strip()
                return json.loads(text)
            except Exception as e:
                print(f"[LLM] Groq call failed: {e}. Checking fallbacks...")

        # 2. Try Gemini if configured
        if self.gemini_client is not None:
            try:
                combined_prompt = f"{system_prompt}\n\nUser Prompt:\n{prompt}\n\nRespond ONLY with valid JSON."
                response = self.gemini_client.models.generate_content(
                    model=self.gemini_model,
                    contents=combined_prompt
                )
                text = response.text.strip()
                if text.startswith("```json"):
                    text = text[7:]
                if text.endswith("```"):
                    text = text[:-3]
                return json.loads(text.strip())
            except Exception as e:
                print(f"[LLM] Gemini call failed: {e}. Switching to deterministic demo mode...")

        # 3. Transparent Deterministic Demo Mode
        return {"_mode": "deterministic_demo_fallback"}


# Singleton instance
llm_client = LLMClient()
