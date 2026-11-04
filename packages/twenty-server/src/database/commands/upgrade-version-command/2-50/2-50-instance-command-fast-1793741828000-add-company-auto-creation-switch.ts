import { QueryRunner } from 'typeorm';
import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.50.0', 1793741828000)
export class AddCompanyAutoCreationSwitchFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "core"."messageChannel" ADD COLUMN IF NOT EXISTS "isCompanyAutoCreationEnabled" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."calendarChannel" ADD COLUMN IF NOT EXISTS "isCompanyAutoCreationEnabled" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "core"."calendarChannel" DROP COLUMN IF EXISTS "isCompanyAutoCreationEnabled"`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."messageChannel" DROP COLUMN IF EXISTS "isCompanyAutoCreationEnabled"`,
    );
  }
}
