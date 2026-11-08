// Dados do projeto Supabase (Project Settings → API).
// A chave publishable/anon é pública por design: quem protege os dados são as regras (RLS) do schema.sql.
window.MENPHIS_CONFIG = {
  SUPABASE_URL: "https://ivtpfvptevbzgfpkggsh.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_1duWo8GhQfY9metmd0J7YQ_HAN5dPuw",

  // Gemini (chat do RPG + Arte IA). ATENÇÃO: esta chave fica visível a quem abrir o site.
  // Restrinja-a por "HTTP referrers" no Google AI Studio / Cloud Console (veja README).
  GEMINI_API_KEY: "AIzaSyDSdYZK6DHWrM9mzWHSypIzwwA1IRj_nX8",
  GEMINI_TEXT_MODEL: "gemini-2.5-flash",
  GEMINI_IMAGE_MODEL: "gemini-2.5-flash-image"
};
