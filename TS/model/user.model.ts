import { Model, DataTypes } from "sequelize";
import { sequelize } from "../util/db.config";

class User extends Model {
    static associate(models: any) {
        User.hasOne(models.Role, {
            foreignKey: "roleId",
            sourceKey: "roleId",
            as: "role"
        });
        User.hasMany(models.Session, {
            foreignKey: "email",
            sourceKey: "email",
            as: "sessions"
        });
        User.belongsTo(models.Rider, {
            foreignKey: "userId",
            targetKey: "userId",
            as: "rider",
        });

        User.belongsTo(models.Driver, {
            foreignKey: "userId",
            targetKey: "userId",
            as: "driver",
        });
    }
}

User.init(
    {
        email: {
            type: DataTypes.STRING(100),
            allowNull: false,
            primaryKey: true,
        },
        password: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        roleId: {
            type: DataTypes.SMALLINT,
            allowNull: false,
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            unique: true,
            defaultValue: sequelize.literal("nextval(\'users_user_id_seq\'::regclass)")
        },
        waypointDistance: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
            defaultValue: 1609.34
        }
    },
    {
        sequelize,
        modelName: "User",
        tableName: "users",
        paranoid: false,
        timestamps: false,
        underscored: true
    }
);

export default User;
