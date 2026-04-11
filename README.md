# Based Cooking

Livro de receitas estático publicado em:

https://guschain.github.io/Based-Cooking/

## Forma mais direta de adicionar uma receita

Faz tudo diretamente no GitHub:

1. Abre o repositório: `https://github.com/guschain/Based-Cooking`
2. Vai à pasta `images/`
3. Faz upload da imagem da receita, por exemplo `images/frango-assado.jpg`
4. Vai à pasta `recipes/`
5. Cria um novo ficheiro, por exemplo `recipes/frango-assado.md`
6. Cola a estrutura abaixo e substitui pelos dados reais
7. Faz `Commit changes...` para `main`
8. Espera a action `Deploy GitHub Pages` terminar
9. Atualiza o site

Quando a imagem e o ficheiro `.md` estão no repositório e o commit chega a `main`, o site é reconstruído automaticamente e cria logo a nova página da receita.

## Modelo do ficheiro `.md`

```md
---
title: Frango Assado
category: Pratos principais
tags: pratos-principais, frango, forno
image: images/frango-assado.jpg
---

#### Ingredientes
- 1 frango
- 4 dentes de alho
- sal q.b.
- azeite q.b.

#### Preparacao
1. Temperar o frango.
2. Levar ao forno.
3. Servir quente.
```

## Regras simples

- A imagem deve ficar em `images/`
- A receita deve ficar em `recipes/`
- O campo `image:` tem de apontar para a imagem certa
- O nome do ficheiro pode ser algo como `frango-assado.md`
- Cada ingrediente deve ficar numa linha começada por `-`
- Cada passo de preparação deve ficar numerado

## Template rápido

Se preferires, copia [templates/recipe-template.md](./templates/recipe-template.md) para dentro de `recipes/` e só trocas os placeholders.

## Publicação

O deploy corre automaticamente em cada push para `main`.

Repositório:

https://github.com/guschain/Based-Cooking
