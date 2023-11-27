import { Model, DataTypes } from "sequelize";
import { sequelize } from "../util/db.config";

class NodeType extends Model {
    static associate(models: any) {
    }
}

NodeType.init(
    {
        nodeTypeId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            defaultValue: sequelize.literal("nextval(\'nodestype_node_type_id_seq\'::regclass)"),
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        logo: {
            type: DataTypes.TEXT,
            allowNull: true,
        }
    },
    {
        sequelize,
        modelName: "NodeType",
        tableName: "nodetypes",
        paranoid: false,
        timestamps: false,
        underscored: true,
    }
);


export default NodeType;
