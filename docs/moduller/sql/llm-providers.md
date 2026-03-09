# backend/sql/llm/providers.py

## Amac
Coklu LLM provider destegi (Groq, OpenAI, Anthropic). Fallback zinciri ile bir provider basarisiz olursa sonrakine gecer. Coklu Groq API key destegi.

## Bagimliliklari
- `groq` -- AsyncGroq
- `openai` -- AsyncOpenAI
- `anthropic` -- AsyncAnthropic
- `backend.core.config` -- Logger

## Fonksiyonlar / Class'lar

| Ad | Tip | Aciklama |
|---|---|---|
| `LLMProvider` | ABC | Soyut LLM provider arayuzu |
| `GroqProvider` | Class | Groq API (llama-3.3-70b-versatile, coklu key) |
| `OpenAIProvider` | Class | OpenAI API (gpt-4o-mini) |
| `AnthropicProvider` | Class | Anthropic API (claude-sonnet-4) |
| `LLMChain` | Class | Fallback zinciri yonetimi |
| `build_llm_chain()` | Factory | Env'den LLM zinciri olusturur |

### Env Degiskenleri
- `LLM_PROVIDER` -- Provider sirasi (groq,openai,anthropic)
- `GROQ_API_KEY`, `GROQ_API_KEY_2`, ... -- Coklu Groq key
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`

## Ornek Kullanim

```python
chain = build_llm_chain()
result = await chain.generate(messages=[...], temperature=0)
```

## Degisiklik Gecmisi

| Tarih | Aciklama |
|---|---|
| 1 Mart 2026 | Ilk surum |
