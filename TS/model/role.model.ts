import { Model, DataTypes } from "sequelize";
import { sequelize } from "../util/db.config";

class Role extends Model {
}

Role.init(
  {
    roleId: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      primaryKey: true,
      defaultValue: sequelize.literal("nextval(\'roles_role_id_seq\'::regclass)"),
    },
    roleType: {
      type: DataTypes.CHAR(15),
      allowNull: false,
      defaultValue: "",
    },
  },
  {
    sequelize,
    modelName: "Role",
    tableName: "roles",
    paranoid: false,
    timestamps: false,
    underscored: true
  }
);

export default Role;
