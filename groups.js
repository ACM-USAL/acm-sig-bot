/// This is an example of a secrets file for the ACM SIG BOT ID
module.exports = {
  /// The telegram id of the main group
  main_group_id: -13039404,

  /// The telegram id of the offtopic group
  ///
  /// If it's not found people won't be added
  /// automatically
  offtopic_group_id: -5059806,

  /// The special interest groups.
  /// This is a map containing the group name as a key
  /// And the group description and id as values
  sigs: [
    {
      title: 'SIGWEB',
      id: -14627750,
      description: "Desarrollo web y seguridad"
    },
    {
      title: 'SIGAI',
      id: -000, /// TODO
      description: "Inteligencia artificial"
    },
    {
      title: 'SIGDEV',
      id: -000,
      descrition: "Desarrollo de aplicaciones, lenguajes de programación",
    },
    {
      title: 'SIGROB',
      id: -000,
      description: "Robótica"
    },
    {
      title: 'SIGMOBILE',
      id: -000,
      description: 'Desarrollo móvil'
    }
  ]
}
