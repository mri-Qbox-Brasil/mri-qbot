const { DataTypes } = require('sequelize');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        // Obter a estrutura da tabela atual para verificar se a coluna já existe (segurança)
        const tableInfo = await queryInterface.describeTable('InstallerActivities');
        
        if (!tableInfo.sessionId) {
            await queryInterface.addColumn('InstallerActivities', 'sessionId', {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: 'legacy_session' // Valor padrão para registros antigos
            });
        }
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn('InstallerActivities', 'sessionId');
    }
};
