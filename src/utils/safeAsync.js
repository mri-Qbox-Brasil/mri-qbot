/**
 * safeAsync: envolve uma função assíncrona para capturar erros e notificá-los
 * via `client.notifyError`. Marca o erro com `_notifiedBySafeAsync` para evitar
 * notificações duplicadas em níveis superiores.
 *
 * Uso:
 * command.execute = safeAsync(command.execute, (args)=>`/commandName`)
 */
function safeAsync(fn, contextProvider) {
    if (typeof fn !== 'function') return fn;

    return async function wrapped(...args) {
        // tenta extrair client e source do primeiro argumento (normalmente Interaction/Message)
        const source = args && args.length > 0 ? args[0] : undefined;
        const client = source?.client || (args[args.length - 1] && args[args.length - 1].logger && args[args.length - 1]) || undefined;
        const context = typeof contextProvider === 'function' ? contextProvider(...args) : contextProvider || 'unknown';

        try {
            return await fn.apply(this, args);
        } catch (err) {
            try {
                // Marca o erro para impedir notificações duplicadas
                try { Object.defineProperty(err, '_notifiedBySafeAsync', { value: true, enumerable: false }); } catch(_) { err._notifiedBySafeAsync = true; }
                if (client && typeof client.notifyError === 'function') {
                    client.notifyError({ client, error: err, context, source });
                } else {
                    // fallback: tentar usar notifyError se exportado globalmente
                    // não há ação além de console em fallback
                    console.error('safeAsync fallback notify:', err?.stack || err);
                }
            } catch (notifyErr) {
                try { client?.logger?.error('safeAsync: falha ao notificar erro', { stack: notifyErr?.stack || notifyErr }); } catch(_) { /* swallow */ }
            }
            throw err; // rethrow para que handlers superiores possam agir, mas they'll skip notification if marked
        }
    };
}

module.exports = { safeAsync };
