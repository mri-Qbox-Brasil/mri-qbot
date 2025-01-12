const PermActionType = {
    ADD: 'ADICIONAR',
    REMOVE: 'REMOVER',
    LIST: 'LISTAR',
    ERROR: 'ERRO'
};

const SupportActionType = {
    ADDED: 'added',
    REMOVED: 'removed',
    EXPIRED: 'expired',
    UPDATED: 'updated'
};

const IdType = {
    USER: 'user',
    ROLE: 'role',
    CHANNEL: 'channel',
    CATEGORY: 'category'
};

module.exports = { PermActionType, SupportActionType, IdType };
