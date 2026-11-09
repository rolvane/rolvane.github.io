# MENPHIS RPG — GitHub Pages + Supabase

Site estático (HTML/CSS/JS) com login, personagens, narrações, tabletop, mapa, regiões, armaria, missões, notas e painel admin.
O GitHub Pages só hospeda os arquivos; contas e dados ficam no **Supabase** (grátis).

## 1. Criar o banco (uma vez)
1. Crie um projeto em https://supabase.com.
2. **SQL Editor → New query**: cole o conteúdo de `schema.sql` e clique em **Run**.
3. *(Recomendado para testar)* **Authentication → Providers → Email**: desligue **Confirm email**.
   Se deixar ligado, cada jogador precisa clicar no link do e-mail antes de entrar.

## 2. Configurar o site
Abra `config.js` e cole a **Project URL** e a chave **anon public** (Project Settings → API).

## 3. Publicar no GitHub
1. Crie um repositório e envie **todos** os arquivos desta pasta (`index.html`, `app.js`, `config.js`, `.nojekyll`...).
2. **Settings → Pages → Deploy from a branch → `main` / root**.
3. Copie o endereço gerado (`https://SEU-USUARIO.github.io/SEU-REPO/`) e cole em Supabase → **Authentication → URL Configuration → Site URL**.

## Login com Google
1. Google Cloud → Credenciais → ID do cliente OAuth (Aplicativo da Web). Em *URIs de redirecionamento autorizados* coloque `https://SEU-PROJETO.supabase.co/auth/v1/callback`.
2. Supabase → Authentication → Providers → Google: ative e cole o Client ID e o Client Secret.
3. Supabase → Authentication → URL Configuration: **Site URL** e **Redirect URLs** com o endereço do GitHub Pages (`https://SEU-USUARIO.github.io/SEU-REPO/`).

## Atualizando um banco que já existe (registro de dados)
Se você já rodou o `schema.sql` antes desta versão, rode o arquivo `update_v3.sql` no SQL Editor (pode repetir sem problema). Ele cria o registro de dados, ajusta o login com Google e cria o perfil de quem já tinha conta.
As rolagens são **sorteadas no servidor** e gravadas com usuário, data e hora; ninguém consegue forjar um resultado pela API. Só admins podem apagar registros.

## Papéis
- O **primeiro usuário cadastrado vira admin**.
- Admin troca o papel dos outros em **Admin Studio** (`jogador`, `mestre`, `admin`).
- **Mestre/Admin**: criam narrações, sessões de tabletop, missões, reinos, regiões, equipamentos e notícias.
- **Jogador**: cria personagens, narra ações, move seus tokens, aceita missões, viaja entre reinos.

## Segurança
A chave `anon` fica visível no código — isso é normal. A proteção real são as políticas RLS do `schema.sql`. Nunca coloque a chave `service_role` no site.

## Gemini (chat do RPG e Arte IA)
- Em `config.js`: `GEMINI_API_KEY`, `GEMINI_TEXT_MODEL` (padrão `gemini-2.5-flash`) e `GEMINI_IMAGE_MODEL` (padrão `gemini-2.5-flash-image`). Se o Google renomear/aposentar um modelo, troque só aqui.
- O botão 💬 abre o **Guardião de Quanti**: ele busca os trechos mais relevantes do livro (`rpg-knowledge.js`, gerado do PDF + clãs) e manda ao Gemini junto com a pergunta.
- **Segurança da chave:** num site estático a chave fica visível no código. Proteja-a em https://aistudio.google.com/apikey → restrinja por *HTTP referrers* ao endereço do seu GitHub Pages e defina uma cota. Se a chave já foi compartilhada em algum lugar, gere outra.
- Se o livro de regras mudar, regere o `rpg-knowledge.js` (ele é só uma lista de textos).

## Limites
- **Arte IA** usa o Gemini; sem chave configurada, cai no serviço gratuito Pollinations. A geração de imagem do Gemini pode exigir faturamento ativo no Google Cloud, dependendo da conta/região.
- **Tutorial** mostra o livro de regras do `rpg-knowledge.js` (texto; as ilustrações do PDF não entram).
- **Ferramentas do mestre** (nomes, loot, NPC, etc.) usam tabelas aleatórias locais, não IA.
- O tabletop salva o estado inteiro do tabuleiro; se duas pessoas moverem peças ao mesmo tempo, vale a última gravação.
