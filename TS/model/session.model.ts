import { Model, DataTypes } from "sequelize";
import { sequelize } from "../util/db.config";

class Session extends Model {
    static associate(models: any) {
        Session.belongsTo(models.User, {
            foreignKey: "userId",
            targetKey: "userId",
            as: "user"
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
        userId: {
            type: DataTypes.NUMBER,
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
