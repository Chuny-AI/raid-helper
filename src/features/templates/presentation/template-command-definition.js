const { SlashCommandBuilder, InteractionContextType } = require('discord.js');

/** Definición declarativa del comando; no contiene lógica de negocio. */
const buildTemplateCommandDefinition = () => new SlashCommandBuilder()
  .setName('template')
  .setContexts(InteractionContextType.Guild)
  .setDescription('Gestión completa de templates del servidor')
  .addSubcommand((subcommand) => subcommand
    .setName('list')
    .setDescription('Muestra todos los templates disponibles del servidor'))
  .addSubcommand((subcommand) => subcommand
    .setName('create')
    .setDescription('Crea un nuevo template para el servidor'))
  .addSubcommand((subcommand) => subcommand
    .setName('edit')
    .setDescription('Edita un template existente del servidor')
    .addStringOption((option) => option
      .setName('template')
      .setDescription('Selecciona el template a editar')
      .setRequired(true)
      .setAutocomplete(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('delete')
    .setDescription('Elimina un template del servidor')
    .addStringOption((option) => option
      .setName('template')
      .setDescription('Selecciona el template a eliminar')
      .setRequired(true)
      .setAutocomplete(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('clone')
    .setDescription('Clona un template existente con un nuevo nombre')
    .addStringOption((option) => option
      .setName('template')
      .setDescription('Template a clonar')
      .setRequired(true)
      .setAutocomplete(true))
    .addStringOption((option) => option
      .setName('name')
      .setDescription('Nombre para el nuevo template')
      .setRequired(true)
      .setMaxLength(100)))
  .addSubcommand((subcommand) => subcommand
    .setName('export')
    .setDescription('Exporta un template a un archivo JSON descargable')
    .addStringOption((option) => option
      .setName('template')
      .setDescription('Selecciona el template a exportar (desde Mongo)')
      .setRequired(true)
      .setAutocomplete(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('import')
    .setDescription('Importa un template desde un archivo JSON adjunto')
    .addAttachmentOption((option) => option
      .setName('json')
      .setDescription('Archivo JSON con la estructura completa del template')
      .setRequired(true))
    .addStringOption((option) => option
      .setName('template_name')
      .setDescription('Nombre del template destino donde se importarán los datos')
      .setRequired(true)
      .setMaxLength(100)))
  .addSubcommand((subcommand) => subcommand
    .setName('rename')
    .setDescription('Renombra el título de un template existente')
    .addStringOption((option) => option
      .setName('template')
      .setDescription('Selecciona el template existente (desde Mongo)')
      .setRequired(true)
      .setAutocomplete(true))
    .addStringOption((option) => option
      .setName('new_template_name')
      .setDescription('Nuevo nombre para el template (obligatorio)')
      .setRequired(true)
      .setMaxLength(100)));

module.exports = { buildTemplateCommandDefinition };
