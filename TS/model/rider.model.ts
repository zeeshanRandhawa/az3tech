import { Model, DataTypes } from "sequelize";
import { sequelize } from "../util/db.config";

class Rider extends Model {
    static associate(models: any) {
        Rider.hasOne(models.User, {
            foreignKey: "userId",
            sourceKey: "userId",
            as: "user",
            onDelete: "cascade"
        });
        Rider.hasMany(models.RiderRoute, {
            foreignKey: "riderId",
            sourceKey: "riderId",
            as: "rroutes",
        });
    }
}

Rider.init(
    {
        riderId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            primaryKey: true,
            defaultValue: sequelize.literal("nextval(\'riders_rider_id_seq\'::regclass)"),
        },
        firstName: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        lastName: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        address: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        city: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        stateProvince: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        zipPostalCode: {
            type: DataTypes.STRING(10),
            allowNull: true,
        },
        profilePicture: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            unique: true
        },
        phoneNumber: {
            type: DataTypes.STRING(20),
            allowNull: true,
        },
    },
    {
        sequelize,
        modelName: "Rider",
        tableName: "riders",
        paranoid: false,
        timestamps: false,
        underscored: true,
    }
);


export default Rider;
