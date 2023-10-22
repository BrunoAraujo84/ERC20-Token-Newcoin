[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://github.com/BrunoAraujo84/ERC20-Token-Newcoin/blob/main/LICENSE)

![GitHub top language](https://img.shields.io/github/languages/top/BrunoAraujo84/ERC20-Token-Newcoin)

![GitHub last commit](https://img.shields.io/github/last-commit/BrunoAraujo84/ERC20-Token-Newcoin)

![Contribuições bem-vindas](https://img.shields.io/badge/contribuições-bem_vindas-brightgreen.svg?style=flat)

# Desenvolvendo Contratos Inteligente

### Criação de um Token ERC-20 e contratos de Staking na rede Ethereum

---

## Descrição Geral

Desenvolvido por Bruno Araujo, este projeto é uma solução completa para criar e gerenciar um token ERC-20 na rede Ethereum, juntamente com contratos de staking e governança. Os contratos foram desenvolvidos utilizando Solidity e são otimizados com as bibliotecas OpenZeppelin para segurança e eficiência.

---

## Características Principais

### Token ERC-20 

- **Fungibilidade**: Criação de um token totalmente fungível seguindo o padrão ERC-20.
- **Interoperabilidade**: Fácil de integrar com outras aplicações e carteiras que suportam o padrão ERC-20.

### Staking

- **Recompensas**: Os usuários podem apostar seus tokens e receber recompensas diário, semestrais, anuais, bienal e Quadrienal.
- **Segurança**: Implementado com as melhores práticas para garantir a segurança dos fundos apostados.

---

## Tecnologias e Ferramentas Utilizadas

- **Solidity**: Linguagem de programação para contratos inteligentes.
- **Hardhat**: Ambiente de desenvolvimento e framework de teste.
- **OpenZeppelin**: Bibliotecas de contratos inteligentes reutilizáveis.

---

## Configuração e Uso

### Pré-requisitos

- Node.js e npm instalados.

### Instalação e Configuração

1. **Instalar dependências**

    ```bash
    npm install
    ```

2. **Limpeza de diretório antes de executar o teste**

    ```bash
    rm -rf cache
    rm -rf artifacts
    ```

3. **Compilar contratos**

    ```bash
    npx hardhat compile
    ```

4. **Realizar testes**

    ```bash
    npx hardhat test
    ```

5. **Fazer o deploy dos contratos**

    ```bash
    npx hardhat run scripts/deploy.js
    ```

---

## Licença

Este projeto está licenciado sob a licença MIT.