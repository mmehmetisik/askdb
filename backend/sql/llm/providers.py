"""
Coklu LLM provider destegi.
Desteklenen: Groq, OpenAI, Anthropic
Fallback zinciri ile calisan abstract arayuz.
"""
from abc import ABC, abstractmethod
from backend.core.config import logger


class LLMProvider(ABC):
    """Soyut LLM provider arayuzu."""

    @abstractmethod
    async def generate(self, messages: list[dict], temperature: float = 0, max_tokens: int = 512) -> str:
        ...

    @abstractmethod
    def name(self) -> str:
        ...


class GroqProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "llama-3.3-70b-versatile"):
        from groq import AsyncGroq
        self.client = AsyncGroq(api_key=api_key)
        self.model = model

    async def generate(self, messages: list[dict], temperature: float = 0, max_tokens: int = 512) -> str:
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content.strip()

    def name(self) -> str:
        return f"groq/{self.model}"


class OpenAIProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "gpt-4o-mini"):
        from openai import AsyncOpenAI
        self.client = AsyncOpenAI(api_key=api_key)
        self.model = model

    async def generate(self, messages: list[dict], temperature: float = 0, max_tokens: int = 512) -> str:
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content.strip()

    def name(self) -> str:
        return f"openai/{self.model}"


class AnthropicProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-20250514"):
        from anthropic import AsyncAnthropic
        self.client = AsyncAnthropic(api_key=api_key)
        self.model = model

    async def generate(self, messages: list[dict], temperature: float = 0, max_tokens: int = 512) -> str:
        # Anthropic API farkli format kullanir: system + user messages
        system_msg = ""
        user_messages = []
        for m in messages:
            if m["role"] == "system":
                system_msg = m["content"]
            else:
                user_messages.append(m)

        kwargs = {
            "model": self.model,
            "messages": user_messages if user_messages else [{"role": "user", "content": messages[0]["content"]}],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if system_msg:
            kwargs["system"] = system_msg

        response = await self.client.messages.create(**kwargs)
        return response.content[0].text.strip()

    def name(self) -> str:
        return f"anthropic/{self.model}"


class LLMChain:
    """Fallback zinciri ile coklu LLM provider yonetimi."""

    def __init__(self):
        self.providers: list[LLMProvider] = []

    def add_provider(self, provider: LLMProvider):
        self.providers.append(provider)
        logger.info(f"[LLM] Provider added: {provider.name()}")

    async def generate(self, messages: list[dict], temperature: float = 0, max_tokens: int = 512) -> str:
        """Zincirdeki provider'lari sirayla dene. Ilk basarili sonucu dondur."""
        if not self.providers:
            raise RuntimeError("Hicbir LLM provider yapilandirilmamis!")

        last_error = None
        for provider in self.providers:
            try:
                result = await provider.generate(messages, temperature, max_tokens)
                return result
            except Exception as e:
                last_error = e
                logger.warning(f"[LLM] {provider.name()} failed: {type(e).__name__}: {e}")
                continue

        raise RuntimeError(f"Tum LLM provider'lar basarisiz oldu. Son hata: {last_error}")

    @property
    def active_provider_name(self) -> str:
        return self.providers[0].name() if self.providers else "yok"


def build_llm_chain() -> LLMChain:
    """Yapilandirmaya gore LLM zinciri olustur."""
    import os

    chain = LLMChain()
    provider_order = os.getenv("LLM_PROVIDER", "groq").split(",")

    for p in provider_order:
        p = p.strip().lower()
        try:
            if p == "groq":
                api_key = os.getenv("GROQ_API_KEY")
                if not api_key:
                    logger.warning("[LLM] GROQ_API_KEY not set, skipping")
                    continue
                model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
                chain.add_provider(GroqProvider(api_key, model))

            elif p == "openai":
                api_key = os.getenv("OPENAI_API_KEY")
                if not api_key:
                    logger.warning("[LLM] OPENAI_API_KEY not set, skipping")
                    continue
                model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
                chain.add_provider(OpenAIProvider(api_key, model))

            elif p == "anthropic":
                api_key = os.getenv("ANTHROPIC_API_KEY")
                if not api_key:
                    logger.warning("[LLM] ANTHROPIC_API_KEY not set, skipping")
                    continue
                model = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")
                chain.add_provider(AnthropicProvider(api_key, model))

            else:
                logger.warning(f"[LLM] Unknown provider: {p}")
        except ImportError as e:
            logger.warning(f"[LLM] {p} package not installed: {e}")
        except Exception as e:
            logger.warning(f"[LLM] {p} provider creation failed: {e}")

    if not chain.providers:
        raise RuntimeError(
            "Hicbir LLM provider yapilandirilamadi! "
            "En az bir API key gerekli (GROQ_API_KEY, OPENAI_API_KEY, veya ANTHROPIC_API_KEY)"
        )

    return chain
