import { Model, DataTypes } from "sequelize";
import { sequelize } from "../util/db.config";

class Rider extends Model {
    static associate(models: any) {
        Rider.belongsTo(models.User, {
            foreignKey: "userId",
            targetKey: "userId",
            as: "user"
        });
        Rider.hasMany(models.RiderRoute, {
            foreignKey: "riderId",
            sourceKey: "riderId",
            as: "rroutes",
            onDelete: "CASCADE"
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
            type: DataTypes.TEXT,
            allowNull: false,
        },
        lastName: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        address: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        city: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        stateProvince: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        zipPostalCode: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        profilePicture: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            unique: true
        },
        phoneNumber: {
            type: DataTypes.TEXT,
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
