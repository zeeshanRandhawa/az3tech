import { Model, DataTypes } from "sequelize";
import { sequelize } from "../util/db.config";

class Session extends Model {
    static associate(models: any) {
        Session.belongsTo(models.User, {
            foreignKey: "email",
            targetKey: "email",
            as: "user",
            onDelete: "cascade"
        });
    }
}

Session.init(
    {
        sessionId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            defaultValue: sequelize.literal("nextval(\'user_sessions_session_id_seq\'::regclass)"),
        },
        sessionToken: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        sessionExpireTimestamp: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        email: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
    },
    {
        sequelize,
        modelName: "Session",
        tableName: "sessions",
        paranoid: false,
        timestamps: false,
        underscored: true
    }
);

export default Session;
