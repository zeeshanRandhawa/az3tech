import { Model, DataTypes } from "sequelize";
import { sequelize } from "../util/db.config";

class Driver extends Model {
    static associate(models: any) {
        Driver.belongsTo(models.User, {
            foreignKey: "userId",
            targetKey: "userId",
            as: "user"
        });
        Driver.hasMany(models.DriverRoute, {
            foreignKey: "driverId",
            sourceKey: "driverId",
            as: "droutes",
            onDelete: "CASCADE"
        });
    }
}

Driver.init(
    {
        driverId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            defaultValue: sequelize.literal("nextval(\'drivers_driver_id_seq\'::regclass)"),
        },
        firstName: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        lastName: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        description: {
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
        capacity: {
            type: DataTypes.INTEGER,
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
            type: DataTypes.STRING(20),
            allowNull: true,
        },
    },
    {
        sequelize,
        modelName: "Driver",
        tableName: "drivers",
        paranoid: false,
        timestamps: false,
        underscored: true,
    }
);


export default Driver;
