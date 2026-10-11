"use strict";
/** Menu e cópia do telefone, compartilhados por Home e Contato. Sem coleta de dados. */
(() => {
    const header = document.querySelector('[data-site-header]');
    const toggle = document.querySelector('[data-menu-toggle]');
    const nav = document.querySelector('#navegacao');
    const closeMenu = () => {
        header?.removeAttribute('data-menu-open');
        toggle?.setAttribute('aria-expanded', 'false');
        toggle?.setAttribute('aria-label', 'Abrir menu');
    };
    if (header && toggle && nav) {
        header.setAttribute('data-menu-enhanced', '');
        toggle.addEventListener('click', () => {
            const open = toggle.getAttribute('aria-expanded') !== 'true';
            header.toggleAttribute('data-menu-open', open);
            toggle.setAttribute('aria-expanded', String(open));
            toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
        });
        nav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
        document.addEventListener('click', event => {
            if (event.target instanceof Node && !header.contains(event.target))
                closeMenu();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && header.hasAttribute('data-menu-open')) {
                closeMenu();
                toggle.focus();
            }
        });
        window.matchMedia('(min-width: 721px)').addEventListener('change', closeMenu);
    }
    // Independent copy controls; no personal data is sent or retained.
    document.querySelectorAll('[data-copy-phone]').forEach(copyButton => {
        const group = copyButton.closest('[data-copy-group]') || copyButton.closest('.contact-item');
        const status = group?.querySelector('[data-copy-status]');
        copyButton.addEventListener('click', async () => {
            const value = copyButton.dataset.copyPhone;
            if (!value || !status)
                return;
            let copied = false;
            try {
                if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(value);
                    copied = true;
                }
                else {
                    const field = document.createElement('textarea');
                    field.value = value;
                    field.style.position = 'fixed';
                    field.style.opacity = '0';
                    field.setAttribute('aria-hidden', 'true');
                    document.body.appendChild(field);
                    field.select();
                    copied = document.execCommand('copy');
                    field.remove();
                    copyButton.focus();
                }
            }
            catch {
                copied = false;
            }
            status.textContent = copied ? 'Telefone copiado.' : `Copie o número: ${value}`;
        });
    });
})();
